# 🩺 Schedula Backend – Feature Summary & API Testing (PowerShell)

This backend supports doctor-patient appointment booking using NestJS + PostgreSQL + TypeORM.

---

## 🔐 1. Authentication & User Roles

### 📝 Register Patient
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/patient/register" `
  -Method Post `
  -Body (@{ email = "johny@example.com"; password = "password123"; name = "Johny"; gender = "male"; age = 25; phoneNumber = "9876543210" } | ConvertTo-Json) `
  -ContentType "application/json"
```
- **Requirements:** None (open endpoint)
- **How to get requirements:** No requirements needed; just run the command.
- **What happens:**
  1. The request hits `src/auth/auth.controller.ts` at the `@Post('patient/register')` endpoint.
  2. The controller calls `registerPatient` in `auth.service.ts`.
  3. The service checks for existing email, hashes the password, creates a new `User` and `Patient` entity, and saves them using TypeORM.
  4. Returns a success message or error if email exists.
- **Files involved:**
  - `src/auth/auth.controller.ts` (controller logic)
  - `src/auth/auth.service.ts` (business logic)
  - `src/auth/dto/patient-register.dto.ts` (DTO validation)
  - `src/user.entity.ts`, `src/patient/patient.entity.ts` (entities)

### 📝 Register Doctor
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/doctor/register" -Method Post `
  -Body (@{ email = "ding@example.com"; password = "password"; name = "Ding"; specialization = "Cardiology"; yearsExperience = 10 } | ConvertTo-Json) `
  -ContentType "application/json"
```
- **Requirements:** None (open endpoint)
- **How to get requirements:** No requirements needed; just run the command.
- **What happens:**
  1. Hits `@Post('doctor/register')` in `auth.controller.ts`.
  2. Calls `registerDoctor` in `auth.service.ts`.
  3. Checks for existing email, hashes password, creates `User` and `Doctor` entities, saves them.
  4. Returns success or error.
- **Files involved:**
  - `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/dto/doctor-register.dto.ts`, `src/user.entity.ts`, `src/doctor/doctor.entity.ts`

### 🔑 Login (Shared for All Users)
#### 👨‍⚕️ Login as Doctor
```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post `
  -Body (@{ email = "ding@example.com"; password = "password" } | ConvertTo-Json) `
  -ContentType "application/json"
$token = $login.token
```
- **Requirements:** Doctor's registered email and password
- **How to get requirements:** Use the email and password you registered the doctor with.
- **What happens:**
  1. Hits `@Post('login')` in `auth.controller.ts`.
  2. Calls `login` in `auth.service.ts`.
  3. Finds doctor user by email, checks password with bcrypt, generates JWT with user ID as payload.
  4. Returns JWT token for use in protected endpoints (e.g., add slot, update profile).

#### 👤 Login as Patient
```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post `
  -Body (@{ email = "johny@example.com"; password = "password123" } | ConvertTo-Json) `
  -ContentType "application/json"
$token = $login.token
```
- **Requirements:** Patient's registered email and password
- **How to get requirements:** Use the email and password you registered the patient with.
- **What happens:**
  1. Hits `@Post('login')` in `auth.controller.ts`.
  2. Calls `login` in `auth.service.ts`.
  3. Finds patient user by email, checks password with bcrypt, generates JWT with user ID as payload.
  4. Returns JWT token for use in protected endpoints (e.g., book appointment, view profile).
- **Files involved:**
  - `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/dto/login.dto.ts`, `src/user.entity.ts`

### 🙍‍♂️ Get Profile
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/profile" -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** Access token (JWT)
- **How to get requirements:** Use the `$token` from the login command.
- **What happens:**
  1. Hits `@Get('auth/profile')` in `auth.controller.ts`.
  2. `JwtAuthGuard` validates JWT and injects user info.
  3. Calls `getProfile` in `auth.service.ts` to fetch user from DB and return profile (without password hash).
- **Files involved:**
  - `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/jwt-auth.guard.ts`, `src/user.entity.ts`

---

## 👩‍⚕️ 2. Doctor Management

### 📋 List All Doctors
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors
```
- **Requirements:** None (public endpoint)
- **How to get requirements:** No requirements needed; just run the command.
- **What happens:**
  1. Hits `@Get()` in `doctor.controller.ts`.
  2. Calls `getDoctors` in `doctor.service.ts` to fetch all doctors from DB.
- **Files involved:**
  - `src/doctor/doctor.controller.ts`, `src/doctor/doctor.service.ts`, `src/doctor/doctor.entity.ts`

### 👁️ View Doctor Profile
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors/<doctor-id>
```
- **Requirements:** `doctor-id` (UUID)
- **How to get requirements:**
  - After registering a doctor, get the doctor ID from the registration response or query the DB:
    ```sql
    SELECT id, name FROM doctor;
    ```
    in pgAdmin or psql.
- **What happens:**
  1. Hits `@Get(':id')` in `doctor.controller.ts`.
  2. Calls `getDoctor` in `doctor.service.ts` to fetch doctor by ID.
- **Files involved:**
  - `src/doctor/doctor.controller.ts`, `src/doctor/doctor.service.ts`, `src/doctor/doctor.entity.ts`

### ✏️ Update Doctor Profile
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors/<doctor-id> -Method PATCH -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{
  "specialization": "Dermatologist"
}'
```
- **Requirements:** `doctor-id`, access token (JWT)
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
  - Get `$token` from login as that doctor.
- **What happens:**
  1. Hits `@Patch(':id')` in `doctor.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `updateDoctor` in `doctor.service.ts` to update doctor info.
- **Files involved:**
  - `src/doctor/doctor.controller.ts`, `src/doctor/doctor.service.ts`, `src/doctor/doctor.entity.ts`, `src/auth/jwt-auth.guard.ts`

---

## 👨‍💻 3. Patient Management


### 👁️ View Patient Profile
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/patients/<patient-id> `
  -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** `patient-id` (UUID), access token (JWT)
- **How to get requirements:**
  - Get `patient-id` from the registration response or by running:
    ```sql
    SELECT id, name FROM patient;
    ```
    in pgAdmin or psql.
  - Get `$token` by logging in as that patient (see Login as Patient section).
- **What happens:**
  1. Hits `@Get(':id')` in `patient.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `getPatient` in `patient.service.ts` to fetch patient info.
- **Files involved:**
  - `src/patient/patient.controller.ts`, `src/patient/patient.service.ts`, `src/patient/patient.entity.ts`, `src/auth/jwt-auth.guard.ts`

### ✏️ Update Patient Profile
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/patients/<patient_id> -Method PATCH `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body (@{ fullName = "Johnny" } | ConvertTo-Json)
```
- **Requirements:** `patient-id`, access token (JWT)
- **How to get requirements:**
  - Get `patient-id` by running:
    ```sql
    SELECT id, name FROM patient;
    ```
  - Get `$token` from login as that patient.
- **What happens:**
  1. Hits `@Patch(':id')` in `patient.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `updatePatient` in `patient.service.ts` to update patient info.
- **Files involved:**
  - `src/patient/patient.controller.ts`, `src/patient/patient.service.ts`, `src/patient/patient.entity.ts`, `src/auth/jwt-auth.guard.ts`

---

## 🗓️ 4. Availability Management (Doctors)

### 📅 Add Slot
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors/<doctor-id>/slots -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{
  "date": "2025-07-18",
  "startTime": "10:00",
  "endTime": "10:30",
  "mode": "wave",
  "maxBookings": 3
}'
```
- **Requirements:** `doctor-id`, access token (JWT)
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
  - Get `$token` from login as that doctor.
- **What happens:**
  1. Hits `@Post()` in `availability.controller.ts` for `/api/doctors/:id/slots`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `addSlot` in `availability.service.ts`.
  4. Service checks doctor ownership, combines date/time, creates and saves slot.
- **Files involved:**
  - `src/availability.controller.ts`, `src/availability.service.ts`, `src/availability_slot.entity.ts`, `src/auth/jwt-auth.guard.ts`, `src/doctor/doctor.entity.ts`

### 📋 Get Slots
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors/<doctor-id>/slots
```
- **Requirements:** `doctor-id`
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
- **What happens:**
  1. Hits `@Get()` in `availability.controller.ts` for `/api/doctors/:id/slots`.
  2. Calls `getSlots` in `availability.service.ts` to fetch all slots for a doctor.
- **Files involved:**
  - `src/availability.controller.ts`, `src/availability.service.ts`, `src/availability_slot.entity.ts`

### ❌ Delete Slot
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/doctors/<doctor-id>/slots/<slot-id> -Method DELETE -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** `doctor-id`, `slot-id`, access token (JWT)
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
  - Get `slot-id` by running:
    ```sql
    SELECT id, "startTime", "endTime" FROM availability_slot WHERE "doctorId" = '<doctor-id>';
    ```
  - Get `$token` from login as that doctor.
- **What happens:**
  1. Hits `@Delete(':slotId')` in `availability.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `deleteSlot` in `availability.service.ts`.
  4. Service checks slot ownership, linked appointments, and deletes if allowed.
- **Files involved:**
  - `src/availability.controller.ts`, `src/availability.service.ts`, `src/availability_slot.entity.ts`, `src/auth/jwt-auth.guard.ts`, `src/doctor/doctor.entity.ts`, `src/appointment.entity.ts`

---

## 📅 5. Appointment Booking

### 🆕 Book Appointment
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/appointments -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{
  "doctorId": "<doctor-id>",
  "slotId": "<slot-id>",
  "reason": "General consultation"
}'
```
- **Requirements:** `doctor-id`, `slot-id`, access token (JWT)
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
  - Get `slot-id` by running:
    ```sql
    SELECT id, "startTime", "endTime" FROM availability_slot WHERE "doctorId" = '<doctor-id>';
    ```
  - Get `$token` from login as the patient.
- **What happens:**
  1. Hits `@Post()` in `appointment.controller.ts` for `/api/appointments`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `createAppointment` in `appointment.service.ts`.
  4. Service checks slot, doctor, patient, and booking rules (stream/wave logic), then saves appointment.
- **Files involved:**
  - `src/appointment.controller.ts`, `src/appointment.service.ts`, `src/appointment.entity.ts`, `src/doctor/doctor.entity.ts`, `src/patient/patient.entity.ts`, `src/availability_slot.entity.ts`, `src/auth/jwt-auth.guard.ts`

---

## 🗓️ 6. Appointment Management (Reschedule & Cancel)

### 🔄 Reschedule Appointment
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/appointments/<appointment-id>/reschedule -Method PATCH -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{
  "slotId": "<new-slot-id>"
}'
```
- **Requirements:** `appointment-id`, `slot-id` (new slot), access token (JWT)
- **How to get requirements:**
  - Get `appointment-id` by running:
    ```sql
    SELECT id, reason FROM appointment WHERE patientId = '<patient-id>';
    ```
  - Get `slot-id` by running:
    ```sql
    SELECT id, "startTime", "endTime" FROM availability_slot WHERE "doctorId" = '<doctor-id>';
    ```
  - Get `$token` from login as the patient.
- **What happens:**
  1. Hits `@Patch(':id/reschedule')` in `appointment.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `rescheduleAppointment` in `appointment.service.ts`.
  4. Service checks appointment, slot, and updates slot if allowed.
- **Files involved:**
  - `src/appointment.controller.ts`, `src/appointment.service.ts`, `src/appointment.entity.ts`, `src/availability_slot.entity.ts`, `src/auth/jwt-auth.guard.ts`

### ❌ Cancel Appointment
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/appointments/<appointment-id> -Method DELETE -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** `appointment-id`, access token (JWT)
- **How to get requirements:**
  - Get `appointment-id` by running:
    ```sql
    SELECT id, reason FROM appointment WHERE patientId = '<patient-id>';
    ```
  - Get `$token` from login as the patient.
- **What happens:**
  1. Hits `@Delete(':id')` in `appointment.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `cancelAppointment` in `appointment.service.ts`.
  4. Service checks appointment and deletes if allowed.
- **Files involved:**
  - `src/appointment.controller.ts`, `src/appointment.service.ts`, `src/appointment.entity.ts`, `src/auth/jwt-auth.guard.ts`

---

## 🧾 7. View Appointments

### 👨‍💻 Patient's Appointments
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/appointments/patient/<patient-id> -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** `patient-id`, access token (JWT)
- **How to get requirements:**
  - Get `patient-id` by running:
    ```sql
    SELECT id, name FROM patient;
    ```
  - Get `$token` from login as that patient.
- **What happens:**
  1. Hits `@Get('patient/:id')` in `appointment.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `getAppointmentsForPatient` in `appointment.service.ts`.
  4. Service fetches all appointments for the patient.
- **Files involved:**
  - `src/appointment.controller.ts`, `src/appointment.service.ts`, `src/appointment.entity.ts`, `src/auth/jwt-auth.guard.ts`, `src/patient/patient.entity.ts`

### 👩‍⚕️ Doctor's Appointments
```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/appointments/doctor/<doctor-id> -Headers @{ Authorization = "Bearer $token" }
```
- **Requirements:** `doctor-id`, access token (JWT)
- **How to get requirements:**
  - Get `doctor-id` by running:
    ```sql
    SELECT id, name FROM doctor;
    ```
  - Get `$token` from login as that doctor.
- **What happens:**
  1. Hits `@Get('doctor/:id')` in `appointment.controller.ts`.
  2. `JwtAuthGuard` checks JWT and role.
  3. Calls `getAppointmentsForDoctor` in `appointment.service.ts`.
  4. Service fetches all appointments for the doctor.
- **Files involved:**
  - `src/appointment.controller.ts`, `src/appointment.service.ts`, `src/appointment.entity.ts`, `src/auth/jwt-auth.guard.ts`, `src/doctor/doctor.entity.ts`

---

**Replace `<doctor-id>`, `<patient-id>`, `<slot-id>`, `<appointment-id>`, and `$token` with actual values from your database and login responses.**

---

## 📂 File Reference Table (Updated)

| Endpoint | Controller | Service | Notes |
|----------|------------|---------|-------|
| /api/auth/patient/register | auth.controller.ts | auth.service.ts | Patient registration |
| /api/auth/doctor/register | auth.controller.ts | auth.service.ts | Doctor registration |
| /api/auth/login | auth.controller.ts | auth.service.ts | Login, JWT generation |
| /api/auth/logout | auth.controller.ts | auth.service.ts | Logout (optional) |
| /api/profile | auth.controller.ts | auth.service.ts | Get profile (JWT) |
| /api/doctors | doctor.controller.ts | doctor.service.ts | List doctors |
| /api/doctors/:id | doctor.controller.ts | doctor.service.ts | View/update doctor |
| /api/patients/:id | patient.controller.ts | patient.service.ts | View/update patient |
| /api/doctors/:id/slots | availability.controller.ts | availability.service.ts | Add/get/delete slots |
| /api/appointments | appointment.controller.ts | appointment.service.ts | Book appointment |
| /api/appointments/:id/reschedule | appointment.controller.ts | appointment.service.ts | Reschedule appointment |
| /api/appointments/:id | appointment.controller.ts | appointment.service.ts | Cancel appointment |
| /api/appointments/patient/:id | appointment.controller.ts | appointment.service.ts | Patient's appointments |
| /api/appointments/doctor/:id | appointment.controller.ts | appointment.service.ts | Doctor's appointments |

---

This guide helps you test and understand the backend API, with each command mapped to the relevant code for easy debugging and learning.
