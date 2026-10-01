import type { Request, Response, NextFunction } from 'express';

/** Administradores são definidos por e-mail na variável ADMIN_EMAILS (separados por vírgula). */
export function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(email).trim().toLowerCase());
}

/** Use depois de requireAuth (que preenche req.isAdmin). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).isAdmin) return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  next();
}
