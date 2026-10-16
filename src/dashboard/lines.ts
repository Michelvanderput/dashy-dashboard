/** One short Dutch line per situation, in Dashy's voice: warm, concrete, never guilt. Claude's own line (MCP) replaces these. */
import type { Resolution } from '../driver';

export interface LineContext {
  /** the task the state driver is looking at, and when: "over 8 min" / "nu" / overdue with its time */
  task?: { title: string; in: string; overdue: boolean; at: string };
  /** next appointment or task, for calm moments */
  nextTitle?: string;
  nextIn?: string;
  /** an open task that is past its deadline for a while: still open, never blamed */
  stale?: string;
  music?: string;
}

export function dashyLine(res: Resolution, c: LineContext = {}): string {
  const k = c.task;
  switch (res.rule) {
    case 'done': return 'Klaar! Even genieten.';
    case 'received': return 'Genoteerd. Ik hou het in de gaten.';
    case 'blocked': return 'Ik zit vast. Kun jij me even helpen?';
    case 'deadlineNear':
      if (!k) return 'Het is bijna zover. Nu doen.';
      if (k.overdue) return `${k.title} was voor ${k.at}. Eén klein stukje nu is genoeg.`;
      return k.in === 'nu' ? `${k.title} is nu aan de beurt.` : `Nog ${k.in} voor ${k.title}. Nu doen.`;
    case 'deadlineSoon': return k ? `${k.title} is aan de beurt${k.in === 'nu' ? '' : ` (over ${k.in})`}. Eén stap tegelijk.` : 'Er komt een deadline aan. Eén stap tegelijk.';
    case 'waiting': return 'Ik wacht op jou.';
    case 'break': return 'Pauze. Rustig aan.';
    case 'working': return 'Lekker bezig. Houd vast.';
    case 'quiet': return c.stale ? `${c.stale} staat nog open. Zullen we een nieuw moment kiezen?` : 'Het is stil. Begin klein: tien minuten is genoeg.';
    case 'idle': return c.music ? `Ik hoor ${c.music}.` : c.nextTitle ? `Straks: ${c.nextTitle}${c.nextIn ? ` (over ${c.nextIn})` : ''}.` : 'Alles rustig.';
  }
}
