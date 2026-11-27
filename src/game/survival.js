export const MAX_HEALTH = 10;
export const MAX_HUNGER = 10;
export const MAX_THIRST = 10;
export const MAX_STAMINA = 10;

const HUNGER_SECONDS = 45; // seconds per food point at rest
const THIRST_SECONDS = 32; // seconds per water point at rest
const STARVE_SECONDS = 8; // seconds per heart lost while starving or parched
const REGEN_SECONDS = 6; // seconds per heart regained while well fed and watered
const SPRINT_SECONDS = 6.5; // seconds of sprinting on full stamina
const REST_SECONDS = 4.5; // seconds to recover full stamina
const WINDED_UNTIL = 3; // stamina needed before sprinting again after running dry

// Advances food, water and health; returns true when the player has fainted.
// hungerRate: extra multiplier on hunger drain (being cold makes you hungrier).
export function tickSurvival(p, dt, sprinting = false, hungerRate = 1) {
  p.thirst ??= MAX_THIRST;
  const effort = sprinting ? 2 : 1;
  p.hunger = Math.max(0, p.hunger - (dt * effort * hungerRate) / HUNGER_SECONDS);
  p.thirst = Math.max(0, p.thirst - (dt * effort) / THIRST_SECONDS);
  if (p.hunger <= 0) p.health = Math.max(0, p.health - dt / STARVE_SECONDS);
  if (p.thirst <= 0) p.health = Math.max(0, p.health - dt / STARVE_SECONDS);
  if (p.hunger >= 7 && p.thirst >= 3) p.health = Math.min(MAX_HEALTH, p.health + dt / REGEN_SECONDS);
  return p.health <= 0;
}

// Sprinting drains stamina; resting restores it (slowly when starving or parched).
// Running dry leaves the player winded until some stamina is back. Returns true the moment that happens.
export function tickStamina(p, dt, sprinting) {
  p.stamina ??= MAX_STAMINA;
  if (sprinting) {
    p.stamina = Math.max(0, p.stamina - (dt * MAX_STAMINA) / SPRINT_SECONDS);
    if (p.stamina <= 0 && !p.winded) {
      p.winded = true;
      return true;
    }
  } else {
    const weak = p.hunger <= 2 || (p.thirst ?? MAX_THIRST) <= 2;
    p.stamina = Math.min(MAX_STAMINA, p.stamina + (dt * MAX_STAMINA * (weak ? 0.4 : 1)) / REST_SECONDS);
    if (p.winded && p.stamina >= WINDED_UNTIL) p.winded = false;
  }
  return false;
}

export function eat(p, amount, water = 0) {
  if (p.hunger >= MAX_HUNGER) return false;
  p.hunger = Math.min(MAX_HUNGER, p.hunger + amount);
  p.thirst = Math.min(MAX_THIRST, (p.thirst ?? MAX_THIRST) + water);
  return true;
}

export function drink(p, amount) {
  p.thirst = Math.min(MAX_THIRST, (p.thirst ?? MAX_THIRST) + amount);
}
