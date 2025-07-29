import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflectRoles(context);
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    console.log('RoleGuard debug:', { user, roles });
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Access denied: insufficient role');
    }
    return true;
  }

  private reflectRoles(context: ExecutionContext): string[] {
    const handler = context.getHandler();
    const classRoles = context.getClass() && Reflect.getMetadata(ROLES_KEY, context.getClass());
    const methodRoles = handler && Reflect.getMetadata(ROLES_KEY, handler);
    return methodRoles || classRoles || [];
  }
}
