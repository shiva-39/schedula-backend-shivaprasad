import { Injectable } from '@nestjs/common';
import { Patient } from '../patient/patient.entity';
import { Appointment } from '../appointment.entity';

interface NotificationData {
  appointmentId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  doctorName: string;
  oldDate?: string;
  oldTime?: string;
  newDate?: string;
  newTime?: string;
  type: 'rescheduled' | 'pending';
  alternativeSlots?: Array<{
    date: string;
    time: string;
    timeBucket: string;
  }>;
}

@Injectable()
export class NotificationService {
  
  /**
   * Send notification to patient about appointment rescheduling
   */
  async sendReschedulingNotification(
    patient: Patient,
    appointment: Appointment,
    type: 'rescheduled' | 'pending',
    newDate?: string,
    newTime?: string,
    alternativeSlots?: Array<{ date: string; time: string; timeBucket: string }>
  ): Promise<void> {
    const notificationData: NotificationData = {
      appointmentId: appointment.id,
      patientName: patient.name,
      patientEmail: patient.user?.email || 'unknown@example.com',
      patientPhone: patient.phoneNumber,
      doctorName: appointment.doctor?.name || 'Unknown Doctor',
      oldDate: appointment.date,
      oldTime: appointment.startTime && appointment.endTime ? 
        `${appointment.startTime.toISOString().substring(11, 16)}-${appointment.endTime.toISOString().substring(11, 16)}` : 
        'Unknown',
      newDate,
      newTime,
      type,
      alternativeSlots
    };

    // Send email notification
    await this.sendEmailNotification(notificationData);
    
    // Send SMS notification (optional)
    await this.sendSMSNotification(notificationData);
    
    // Log the notification for debugging
    console.log('\n🔔 PATIENT NOTIFICATION SENT:');
    console.log('=' .repeat(50));
    console.log('📧 Notification Details:', {
      patient: notificationData.patientName,
      email: notificationData.patientEmail,
      phone: notificationData.patientPhone,
      type: notificationData.type,
      appointment: notificationData.appointmentId,
      doctor: notificationData.doctorName
    });
    console.log('=' .repeat(50));
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(data: NotificationData): Promise<void> {
    let subject: string;
    let body: string;

    if (data.type === 'rescheduled') {
      subject = `Appointment Rescheduled - ${data.doctorName}`;
      body = `
Dear ${data.patientName},

Your appointment with ${data.doctorName} has been moved due to schedule changes.

Previous appointment:
📅 Date: ${data.oldDate}
🕐 Time: ${data.oldTime}

New appointment:
📅 Date: ${data.newDate}
🕐 Time: ${data.newTime}

Please make note of your new appointment time. If you have any questions or need to make changes, please contact us.

Best regards,
Schedula Team
      `;
    } else {
      subject = `Action Required: Appointment Rescheduling - ${data.doctorName}`;
      body = `
Dear ${data.patientName},

Your appointment with ${data.doctorName} could not be automatically rescheduled due to schedule changes.

Original appointment:
📅 Date: ${data.oldDate}
🕐 Time: ${data.oldTime}

Please select a new appointment time from the available options:

${data.alternativeSlots?.map(slot => 
  `• ${slot.date} at ${slot.time} (${slot.timeBucket})`
).join('\n') || '• Please contact us to view available slots'}

Please log into your account or contact us to reschedule your appointment as soon as possible.

Best regards,
Schedula Team
      `;
    }

    // TODO: Integrate with actual email service (SendGrid, AWS SES, NodeMailer, etc.)
    console.log('\n📧 EMAIL NOTIFICATION PREVIEW:');
    console.log('-' .repeat(40));
    console.log('To:', data.patientEmail);
    console.log('Subject:', subject);
    console.log('Body:', body);
    console.log('-' .repeat(40));
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(data: NotificationData): Promise<void> {
    let message: string;

    if (data.type === 'rescheduled') {
      message = `Hi ${data.patientName}, your appointment with ${data.doctorName} has been moved from ${data.oldDate} ${data.oldTime} to ${data.newDate} ${data.newTime}. Please save the new time. -Schedula`;
    } else {
      message = `Hi ${data.patientName}, your appointment with ${data.doctorName} on ${data.oldDate} ${data.oldTime} needs rescheduling. Please log in to select a new time slot. -Schedula`;
    }

    // TODO: Integrate with actual SMS service (Twilio, AWS SNS, etc.)
    console.log('\n📱 SMS NOTIFICATION PREVIEW:');
    console.log('-' .repeat(40));
    console.log('To:', data.patientPhone);
    console.log('Message:', message);
    console.log('-' .repeat(40));
  }

  /**
   * Format time slots for display
   */
  private formatTimeSlot(startTime: string, endTime: string): string {
    return `${startTime}-${endTime}`;
  }

  /**
   * Classify time bucket for better user experience
   */
  private classifyTimeBucket(time: string): string {
    const hour = parseInt(time.split(':')[0]);
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  }
}
