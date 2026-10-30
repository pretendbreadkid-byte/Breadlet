// Slash commands for chat. The chat box shows the ones a player can use when they type "/".
// "everyone" commands run in the chat box itself (/ai goes to chat, /accept and /cancel to the
// games API); mod and admin commands run on the server at /api/chat/command.
export type ChatCommandRole = 'everyone' | 'mod' | 'admin';
export type ChatCommand = { name: string; usage: string; description: string; role: ChatCommandRole };

export const CHAT_COMMANDS: ChatCommand[] = [
  { name: 'ai', usage: '/ai <question>', description: 'Ask Breadlet a question', role: 'everyone' },
  { name: 'accept', usage: '/accept', description: 'Join the open coin flip', role: 'everyone' },
  { name: 'cancel', usage: '/cancel', description: 'Cancel your game', role: 'everyone' },
  { name: 'mute', usage: '/mute <player> [minutes]', description: 'Time a player out of chat (30 minutes if no time given)', role: 'mod' },
  { name: 'unmute', usage: '/unmute <player>', description: 'End a player\'s chat timeout', role: 'mod' },
  { name: 'ban', usage: '/ban <player> [hours] [reason]', description: 'Ban a player (permanent if no hours given)', role: 'admin' },
  { name: 'unban', usage: '/unban <player>', description: 'Unban a player', role: 'admin' },
  { name: 'unbannetwork', usage: '/unbannetwork <player>', description: 'Lift the device and Wi-Fi bans a banned player left (they stay banned)', role: 'admin' },
  { name: 'give', usage: '/give <player> <amount>', description: 'Give a player Bread Bucks', role: 'admin' },
  { name: 'announce', usage: '/announce <message>', description: 'Breadlet posts your message in chat', role: 'admin' },
  { name: 'stock', usage: '/stock <bag> [minutes]', description: 'Put a bag in Ted\'s Shop (60 minutes if no time given) and announce it to everyone', role: 'admin' },
  { name: 'unstock', usage: '/unstock <bag>', description: 'End a bag you put in stock with /stock', role: 'admin' },
  { name: 'help', usage: '/help', description: 'List the commands you can use', role: 'mod' },
];

export const SERVER_COMMANDS = new Set(CHAT_COMMANDS.filter((command) => command.role !== 'everyone').map((command) => command.name));

export const commandsFor = (role: 'admin' | 'full' | 'limited' | null) =>
  CHAT_COMMANDS.filter((command) => command.role === 'everyone' || (command.role === 'mod' && (role === 'admin' || role === 'full')) || (command.role === 'admin' && role === 'admin'));
