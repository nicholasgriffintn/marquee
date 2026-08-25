import type { UserRole } from "../auth/model.ts";
import type { Bindings } from "../types.ts";

export async function setUserRole(env: Bindings, userId: string, role: UserRole) {
  const updated = await env.DB.prepare(
    `UPDATE users
     SET role = ?1
     WHERE id = ?2
       AND (
         ?1 = 'admin'
         OR role <> 'admin'
         OR EXISTS (
           SELECT 1 FROM users AS other
           WHERE other.role = 'admin' AND other.id <> ?2
         )
       )
     RETURNING id`,
  )
    .bind(role, userId)
    .first<{ id: string }>();

  if (updated) {
    return { ok: true as const };
  }

  const existing = await env.DB.prepare("SELECT role FROM users WHERE id = ?1")
    .bind(userId)
    .first<{ role: UserRole }>();

  return existing
    ? {
        ok: false as const,
        code: "last_admin" as const,
        error: "There has to be at least one administrator",
      }
    : { ok: false as const, code: "not_found" as const, error: "No such user" };
}
