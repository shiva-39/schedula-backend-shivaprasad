import { 
  PipeTransform, 
  Injectable, 
  ArgumentMetadata, 
  BadRequestException 
} from '@nestjs/common';
import { isValidTimeFormat, isValidDateFormat } from '../utils/time-utils';

@Injectable()
export class TimeFormatValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (typeof value === 'object' && value !== null) {
      this.validateTimeFields(value);
    }
    return value;
  }

  private validateTimeFields(obj: any) {
    const timeFields = ['startTime', 'endTime'];
    const dateFields = ['date', 'startDate', 'endDate'];

    // Validate time fields
    timeFields.forEach(field => {
      if (obj[field] && !isValidTimeFormat(obj[field])) {
        throw new BadRequestException(
          `${field} must be in HH:MM format (24-hour). Example: 09:30, 14:45`
        );
      }
    });

    // Validate date fields
    dateFields.forEach(field => {
      if (obj[field] && !isValidDateFormat(obj[field])) {
        throw new BadRequestException(
          `${field} must be in YYYY-MM-DD format. Example: 2025-12-25`
        );
      }
    });
  }
}
