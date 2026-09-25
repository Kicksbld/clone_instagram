// Schéma Drizzle, référence du modèle de données (ADR-007).
// Chaque tranche y ajoute ses tables ; toute table créée active RLS sans policy (ADR-004).
export { profiles, type NewProfileRow, type ProfileRow } from './profiles.ts';
