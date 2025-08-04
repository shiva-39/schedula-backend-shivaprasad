# Elastic Scheduling System - Code Implementation Flow

## Teams Presentation Overview
This document explains the code implementation flow for the elastic scheduling system with edge case handling, organized for technical review and screen sharing.

## System Architecture

### Core Implementation Components
1. **Template Management** - `recurring-schedule.service.ts`
2. **Schedule Override System** - `elastic-schedule.service.ts` 
3. **Automatic Rescheduling Engine** - Lines 257-362 in `elastic-schedule.service.ts`
4. **Conflict Prevention System** - `appointment.service.ts`
5. **Notification Data Structure** - Structured JSON responses

---

## Implementation Flow (Screen Share Order)

### 1. Template Creation Implementation

**File:** `src/elastic-schedule/recurring-schedule.service.ts`

**Core Logic Flow:**
- **Lines 36-65**: Template entity creation with scheduling parameters
- **Lines 40-53**: Store reusable template (Mon-Fri, 1-7 PM, 30-min slots)
- **Lines 58-60**: Auto-generation trigger for daily schedules
- **Lines 245-285**: Batch generation of elastic schedules for 4 weeks

**Key Implementation Details:**
```typescript
// Template stores: startTime, endTime, slotDuration, bufferTime, maxAppointments
// Auto-generates daily schedules when autoGenerate: true
// Creates foundation for all scheduling operations
```

**What This Achieves:**
- Creates reusable scheduling template
- Automatically generates daily schedules
- Provides override capability for specific dates

---

### 2. Slot Availability Calculation

**File:** `src/elastic-schedule/elastic-schedule.service.ts`

**Core Logic Flow:**
- **Lines 158-228**: Main slot availability engine
- **Lines 160-168**: Priority system (manual overrides first)
- **Lines 174-188**: Template fallback and auto-generation
- **Lines 190-198**: Status filtering (`In(['scheduled', 'rescheduled'])`)
- **Lines 200-210**: Available slot calculation

**Key Implementation Details:**
```typescript
// UTC timestamp extraction: .toISOString().substring(11, 16)
// Excludes cancelled appointments from booked slots
// Prioritizes manual overrides over auto-generated schedules
```

**What This Achieves:**
- Smart schedule discovery with priority system
- Accurate time conflict detection
- Dynamic slot availability calculation

---

### 3. Appointment Booking with Conflict Prevention

**File:** `src/appointment.service.ts`

**Core Logic Flow:**
- **Lines 72-180**: Transaction-wrapped booking process
- **Lines 75-82**: Patient/doctor validation
- **Lines 128-138**: Time range validation against template
- **Lines 157-170**: Existing appointment lookup with status filtering
- **Lines 172-180**: UTC timestamp conflict detection
- **Lines 182-188**: Double-booking prevention
- **Lines 190-200**: Appointment creation with proper timestamps

**Key Implementation Details:**
```typescript
// Time boundary checking using minute conversion
// UTC timestamp comparison for accurate conflict detection
// Database transactions for data integrity
// Status filtering excludes cancelled appointments
```

**What This Achieves:**
- Prevents double-booking scenarios
- Validates time boundaries
- Ensures data integrity with transactions

---

### 4. Schedule Override and Automatic Rescheduling

**File:** `src/elastic-schedule/elastic-schedule.service.ts`

**Core Logic Flow:**
- **Lines 230-256**: Day-specific schedule override creation
- **Lines 257-362**: Automatic rescheduling engine (main feature)
- **Lines 262-272**: Fetch existing scheduled appointments
- **Lines 278-288**: Generate new available slots from reduced schedule
- **Lines 290-294**: Calculate capacity (`Math.min(appointments, slots)`)
- **Lines 296-330**: Reschedule accommodated patients
- **Lines 332-346**: Cancel patients who don't fit
- **Lines 348-362**: Comprehensive result reporting

**Key Implementation Details:**
```typescript
// Capacity reduction: 5 slots → 3 slots (14:00-15:30)
// Smart slot generation with buffer time
// Status updates: 'scheduled' → 'rescheduled' or 'cancelled'
// Notification data structure for frontend integration
```

**What This Achieves:**
- Handles schedule capacity reduction edge cases
- Automatically reschedules existing patients
- Provides notification data for cancelled patients

---

### 5. Edge Case: Capacity Reduction Logic

**Critical Implementation:** Lines 278-346 in `elastic-schedule.service.ts`

**Step-by-Step Process:**
1. **Lines 278-288**: Generate new slots from reduced schedule
   ```typescript
   // 14:00-15:30 with 30-min slots + 5-min buffer = 3 slots
   // Slots: 14:00-14:30, 14:35-15:05, 15:10-15:40
   ```

2. **Lines 290-294**: Calculate accommodation capacity
   ```typescript
   const canFitInSlots = Math.min(appointmentsToReschedule.length, availableSlots.length);
   // 5 patients vs 3 slots = only 3 can be accommodated
   ```

3. **Lines 296-330**: Reschedule first 3 patients
   ```typescript
   // Update appointment times and status to 'rescheduled'
   // Track old vs new times for notification
   ```

4. **Lines 332-346**: Cancel remaining patients
   ```typescript
   // Set status to 'cancelled'
   // Generate notification data with rebooking guidance
   ```

**What This Achieves:**
- Handles capacity reduction scenarios automatically
- Provides fair patient accommodation (first-come-first-served)
- Creates structured notification data for frontend

---

### 6. Patient Status Verification System

**File:** `src/appointment.service.ts`

**Core Logic Flow:**
- **Lines 220-245**: Patient appointment retrieval
- **Lines 222-230**: Security validation (patient ownership)
- **Lines 235-245**: Appointment history with status tracking

**Key Implementation Details:**
```typescript
// Returns appointments with status: 'scheduled', 'rescheduled', 'cancelled'
// Includes status messages for user understanding
// Security check ensures patients only see their own appointments
```

**What This Achieves:**
- Secure patient data access
- Clear status tracking for rescheduled/cancelled appointments
- Frontend-ready appointment data

---

### 7. Notification System Implementation

**Output Structure:** From rescheduling operations

**Key Components:**
```json
{
  "rescheduled": [
    {"appointmentId": "...", "oldTime": "13:00-13:30", "newTime": "14:00-14:30"}
  ],
  "notifiedPatients": [
    {
      "appointmentId": "...", 
      "oldTime": "15:30-16:00",
      "reason": "Schedule updated with fewer slots available. Please book new appointment."
    }
  ]
}
```

**What This Achieves:**
- Structured data for email/SMS notifications
- Clear distinction between rescheduled vs cancelled patients
- Actionable guidance for manual rebooking

---

## Technical Implementation Highlights

### 1. UTC Timestamp Standardization
**Implementation:** Lines 172-180 in `appointment.service.ts`
```typescript
// Standardized across all services
const timeStr = appointment.startTime.toISOString().substring(11, 16)
// Ensures accurate cross-timezone conflict detection
```

### 2. Status Filtering Strategy
**Implementation:** Lines 190-198 in `elastic-schedule.service.ts`
```typescript
status: In(['scheduled', 'rescheduled']) // Excludes cancelled
// Cancelled appointments automatically free up slots
```

### 3. Transaction-Based Operations
**Implementation:** Lines 72-180 in `appointment.service.ts`
```typescript
await this.dataSource.transaction(async manager => {
  // All booking operations wrapped in transactions
  // Ensures data integrity during complex operations
})
```

### 4. Smart Capacity Management
**Implementation:** Lines 290-294 in `elastic-schedule.service.ts`
```typescript
const canFitInSlots = Math.min(appointmentsToReschedule.length, availableSlots.length);
// Fair accommodation: first-come-first-served basis
```

### 5. Notification Data Structure
**Implementation:** Lines 348-362 in `elastic-schedule.service.ts`
```typescript
{
  rescheduled: [{appointmentId, oldTime, newTime}],
  notifiedPatients: [{appointmentId, oldTime, reason}],
  summary: {totalAppointments, successfullyRescheduled, needsRebooking}
}
// Frontend-ready notification data
```

---

## Demo Workflow Implementation

### Capacity Reduction Scenario (5 → 3 Slots)
1. **Initial State**: 5 patients booked (13:00-16:00)
2. **Override Trigger**: Doctor reduces to 14:00-15:30 (3 slots)
3. **Auto-Rescheduling**: First 3 patients get new times
4. **Notification**: Last 2 patients get cancellation with rebooking guidance

### Key Edge Cases Handled
- Double-booking prevention
- Time range validation
- Cancelled appointment slot recovery
- Manual rebooking workflow
- Cross-timezone timestamp handling

This implementation provides a complete elastic scheduling system with comprehensive edge case handling and notification support.
