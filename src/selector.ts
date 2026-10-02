import { emitKeypressEvents } from 'node:readline';
export async function selectProfile(
  profiles: { id: string; label: string }[],
): Promise<string | null> {
  const input = process.stdin,
    output = process.stderr;
  const wasRaw = input.isRaw;
  let selected = 0;
  return await new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      input.off('keypress', key);
      output.off('resize', render);
      input.off('error', fail);
      output.off('error', fail);
      process.off('SIGINT', cancel);
      process.off('SIGTERM', cancel);
      // The selector owns its stdin reads. Stop them on every exit, including
      // handoff, so this process neither stays alive nor consumes child input.
      try {
        input.setRawMode(wasRaw);
      } finally {
        input.pause();
        output.write('\x1b[?25h\x1b[?1049l');
      }
    };
    const finish = (value: string | null, error?: unknown) => {
      if (done) return;
      done = true;
      try {
        cleanup();
      } catch (e) {
        error ??= e;
      }
      if (error) reject(error);
      else resolve(value);
    };
    const fail = (error: Error) => finish(null, error);
    const cancel = () => finish(null);
    const render = () => {
      try {
        const rows = output.rows || 24,
          columns = output.columns || 80;
        if (rows < 8 || columns < 20)
          throw new Error('Terminal too small; use an explicit identity.');
        const width = columns - 1;
        // Profile IDs are ASCII. Wrap the complete selected ID before any label
        // rows so even common-prefix IDs remain distinguishable before Enter.
        const identity = `ID: ${profiles[selected].id}`;
        const details: string[] = [];
        for (let offset = 0; offset < identity.length; offset += width)
          details.push(identity.slice(offset, offset + width));
        const height = Math.max(1, rows - details.length - 3);
        const start = Math.max(
          0,
          Math.min(selected - Math.floor(height / 2), profiles.length - height),
        );
        // Conservative two-column clipping keeps Unicode labels within the frame.
        const choices = profiles.slice(start, start + height).map(
          (p, i) =>
            `${start + i === selected ? '>' : ' '} ${Array.from(p.label)
              .slice(0, Math.floor((width - 2) / 2))
              .join('')}`,
        );
        const lines = [
          'Select synthetic profile'.slice(0, width),
          ...details,
          ...choices,
          'Arrows/Enter; Esc cancels'.slice(0, width),
        ];
        output.write('\x1b[H\x1b[2J' + lines.join('\r\n'));
      } catch (e) {
        finish(null, e);
      }
    };
    const key = (_text: string, k: { name?: string; ctrl?: boolean }) => {
      if (k.name === 'escape' || (k.ctrl && k.name === 'c')) return cancel();
      if (k.name === 'return') return finish(profiles[selected].id);
      if (k.name === 'up')
        selected = (selected + profiles.length - 1) % profiles.length;
      if (k.name === 'down') selected = (selected + 1) % profiles.length;
      render();
    };
    try {
      emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      input.on('keypress', key);
      output.on('resize', render);
      input.on('error', fail);
      output.on('error', fail);
      process.on('SIGINT', cancel);
      process.on('SIGTERM', cancel);
      output.write('\x1b[?1049h\x1b[?25l');
      render();
    } catch (e) {
      finish(null, e);
    }
  });
}
