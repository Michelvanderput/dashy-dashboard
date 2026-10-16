/** One short Dutch line per situation, in Dashy's voice: warm, concrete, never guilt. Claude's own line (MCP) replaces these. */
import type { Resolution } from '../driver';

export interface LineContext { nextTitle?: string; nextIn?: string; music?: string }

export function dashyLine(res: Resolution, c: LineContext = {}): string {
  const t = c.nextTitle;
  switch (res.rule) {
    case 'done': return 'Klaar! Even genieten.';
    case 'received': return 'Genoteerd. Ik hou het in de gaten.';
    case 'blocked': return 'Ik zit vast. Kun jij me even helpen?';
    case 'deadlineNear': return t ? `${t} staat bijna voor de deur${c.nextIn ? ` (over ${c.nextIn})` : ''}. Nu doen.` : 'Het is bijna zover. Nu doen.';
    case 'deadlineSoon': return t ? `${t} is aan de beurt. Eén stap tegelijk.` : 'Er komt een deadline aan. Eén stap tegelijk.';
    case 'waiting': return 'Ik wacht op jou.';
    case 'break': return 'Pauze. Rustig aan.';
    case 'working': return 'Lekker bezig. Houd vast.';
    case 'quiet': return 'Het is stil. Begin klein: tien minuten is genoeg.';
    case 'idle': return c.music ? `Ik hoor ${c.music}.` : t ? `Straks: ${t}${c.nextIn ? ` (over ${c.nextIn})` : ''}.` : 'Alles rustig.';
  }
}
