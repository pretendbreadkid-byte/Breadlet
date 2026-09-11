import { BREADLET_CONFIG } from './game-config';

export function assertPositiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

export function assertTokenBalance(balance: number, required: number) {
  if (balance < required) {
    throw new Error('Insufficient tokens.');
  }
}

export function isAllowedShinyBlook(name: string) {
  return BREADLET_CONFIG.shinyWhitelist.some((blook) => blook === name);
}

export function validateLuck(luck: number) {
  if (!Number.isFinite(luck) || luck < 0) {
    throw new Error('Luck must be a valid non-negative number.');
  }
}

export function validateUsername(username: string) {
  if (!username || username.trim().length < 3 || username.trim().length > 20) {
    throw new Error('Username must be 3-20 characters long.');
  }
}
