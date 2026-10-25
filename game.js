// Draughts (English draughts) on start.ng. Every game runs in a room on start.ng's server, which checks each move (captures are
// compulsory, men move forwards, kings both ways), so nobody can cheat, and a player who drops can come back.
// Needs https://start.ng/kit.js (loaded in index.html).
(() => {
  const $ = (id) => document.getElementById(id);
  const FILES = 'abcdefgh';
  const sqName = (i) => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
  const REASONS = {
    not_found: 'That room has closed, or the code is wrong.',
    nobody_came: 'Nobody joined in time, so the room closed.',
    inactive: 'The room closed because nobody moved for a while.',
    empty: 'The room closed because everyone left.',
    finished: 'That game is over and the room closed.',
    too_old: 'That room was open too long, so it closed.',
    no_match: 'No match was found. Try again, or play the bot.',
    offline: "Couldn't reconnect. Check your connection and try again.",
    code_4403: 'That room is full.',
    code_4404: 'That room has closed, or the code is wrong.',
    code_4409: 'You joined from another tab, so this one stopped.',
    code_4429: 'Too many wrong codes. Wait a minute and try again.',
    code_4401: 'Sign in with start.ng to play.',
  };

  let room = null;
  let path = []; // the squares picked so far for the move being built, like ["c3", "e5"]
  let botNext = false; // "Play the bot": make a room, then add the bot
  let onlineTimer = null;

  const show = (name) => {
    for (const id of ['lobby', 'waiting', 'game']) $(id).hidden = id !== name;
    if (name === 'lobby') refreshOnline();
  };
  const problem = (text) => { $('lobby-problem').textContent = text || ''; $('lobby-problem').hidden = !text; };
  const reasonText = (reason) => REASONS[reason] || 'The room closed.';
  const note = (text) => { $('game-note').textContent = text || ''; };
  const nameOf = (seat) => room?.players.find((p) => p.seat === seat)?.name ?? (seat === 0 ? 'Light' : 'Dark');

  // ---------- the lobby ----------

  async function refreshOnline() {
    const n = await startng.rooms.online();
    const badge = $('online');
    badge.hidden = n === null || n === 0;
    if (n) badge.textContent = `${n} online`;
  }

  function needSignIn(why) {
    problem(why);
    $('signin').hidden = false;
  }

  async function guarded(open) {
    problem('');
    $('signin').hidden = true;
    try {
      return await open();
    } catch (err) {
      if (err.message === 'signin') needSignIn('Sign in with start.ng to play draughts.');
      else if (/^closed:/.test(err.message)) problem(reasonText(`code_${err.message.slice(7)}`));
      else problem(err.message || "Couldn't start. Try again.");
      return null;
    }
  }

  function wire(r) {
    room = r;
    path = [];
    r.on('welcome', () => {
      if (botNext && r.status === 'waiting') { botNext = false; r.playBot(); }
      render();
    });
    r.on('state', () => { path = []; render(); });
    r.on('join', () => render());
    r.on('away', (m) => { render(); note(`${nameOf(m.seat)} dropped. They have 10 minutes to come back.`); });
    r.on('back', () => { render(); note(''); });
    r.on('waiting', () => render());
    r.on('no_match', () => render('no_match'));
    r.on('reconnecting', () => note('Reconnecting…'));
    r.on('open', () => note(''));
    r.on('error', (m) => note(m.message));
    r.on('closed', (m) => leaveRoom(reasonText(m.reason)));
    render();
  }

  async function open(make) {
    const r = await guarded(make);
    if (r) wire(r);
    return r;
  }

  const createRoom = () => open(() => startng.rooms.create());
  const findMatch = () => open(() => startng.rooms.quickMatch());
  const playBot = () => { botNext = true; open(() => startng.rooms.create()).then((r) => { if (!r) botNext = false; }); };
  async function joinRoom(code) {
    const r = await open(() => startng.rooms.join(code));
    if (!r && new URLSearchParams(location.search).has('room')) history.replaceState(null, '', location.pathname);
  }

  function leaveRoom(message) {
    room?.leave();
    room = null;
    path = [];
    history.replaceState(null, '', location.pathname);
    show('lobby');
    problem(message || '');
  }

  // ---------- drawing the game ----------

  function render(extra) {
    if (!room) return;
    if (room.code) history.replaceState(null, '', `${location.pathname}?room=${room.code}`);
    if (room.status === 'waiting' || room.status === null) {
      show('waiting');
      const matching = !room.code;
      $('waiting-title').textContent = matching ? 'Looking for a player…' : 'Waiting for a friend';
      $('code-box').hidden = matching;
      $('room-code').textContent = room.code || '';
      $('waiting-note').textContent = matching
        ? (extra === 'no_match' ? 'No one yet. Play the bot, or keep waiting.' : 'This can take a minute.')
        : 'Send them the code or the link. The room waits 15 minutes.';
      return;
    }
    show('game');
    drawBoard();
    $('players').replaceChildren(...room.players.map((p) => {
      const span = document.createElement('span');
      span.innerHTML = `<i class="dot p${p.seat}"></i>`;
      span.append(p.seat === room.you ? 'You' : p.name);
      if (room.turn === p.seat) span.className = 'turn';
      if (!p.online) span.className += ' away';
      return span;
    }));
    const result = room.result;
    const mine = room.turn === room.you;
    $('status').textContent = result ? outcome(result) : mine ? (room.state.must_capture ? 'Your turn: you have to capture' : 'Your turn') : `Waiting for ${nameOf(room.turn)}`;
    $('after').hidden = !result;
    $('resign').hidden = !!result;
  }

  function outcome(result) {
    if (result.winner === null || result.winner === undefined) return 'Draw: 40 moves with no capture';
    const won = result.winner === room.you;
    if (result.reason === 'left') return 'They left. You win!';
    if (result.reason === 'resigned') return won ? 'They resigned. You win!' : 'You resigned';
    return won ? 'You win!' : 'You lost';
  }

  // The moves that start with what has been picked so far, and where the piece can go next.
  const matching = () => room.state.moves.filter((m) => path.every((s, i) => m[i] === s));
  const nextSquares = () => new Set(matching().filter((m) => m.length > path.length).map((m) => m[path.length]));

  function drawBoard() {
    const { board, last, moves, turn } = room.state;
    const flip = room.you === 1; // the second player sees their own pieces at the bottom
    const canMove = room.status === 'playing' && turn === room.you;
    const starts = new Set(moves.map((m) => m[0]));
    const targets = canMove && path.length ? nextSquares() : new Set();
    const cells = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const i = flip ? row * 8 + (7 - col) : (7 - row) * 8 + col;
        const name = sqName(i);
        const piece = board[i];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sq ${(Math.floor(i / 8) + (i % 8)) % 2 === 0 ? 'dark' : ''}`;
        if (last?.includes(name)) b.classList.add('last');
        if (path.includes(name)) b.classList.add('selected');
        if (targets.has(name)) b.classList.add('target');
        if (piece) {
          const disc = document.createElement('span');
          disc.className = `disc p${piece[1]} ${piece[0] === 'k' ? 'king' : ''}`;
          b.append(disc);
        }
        if (col === 0 || row === 7) {
          const c = document.createElement('span');
          c.className = 'coord';
          c.textContent = (col === 0 ? name[1] : '') + (row === 7 ? name[0] : '');
          b.append(c);
        }
        b.setAttribute('aria-label', `${name}${piece ? `, ${piece[1] === '0' ? 'light' : 'dark'} ${piece[0] === 'k' ? 'king' : 'man'}` : ''}`);
        b.disabled = !canMove || !(starts.has(name) || targets.has(name) || path.includes(name));
        b.onclick = () => click(name);
        cells.push(b);
      }
    }
    $('board').replaceChildren(...cells);
  }

  function click(name) {
    if (!path.length) { path = [name]; drawBoard(); return; }
    if (name === path[0] && path.length === 1) { path = []; drawBoard(); return; } // picking the same piece again puts it down
    if (!nextSquares().has(name)) { path = room.state.moves.some((m) => m[0] === name) ? [name] : []; drawBoard(); return; }
    path = [...path, name];
    const complete = room.state.moves.find((m) => m.length === path.length && m.every((s, i) => s === path[i]));
    if (complete) { room.send({ path }); path = []; return; }
    drawBoard(); // a jump with more to do: pick the next square
  }

  // ---------- buttons ----------

  $('friend').onclick = createRoom;
  $('match').onclick = findMatch;
  $('bot').onclick = playBot;
  $('join').onsubmit = (e) => { e.preventDefault(); const code = $('code').value.trim(); if (code) joinRoom(code); };
  $('signin').onclick = () => startng.signIn();
  $('back').onclick = () => leaveRoom('');
  $('resign').onclick = () => { if (confirm('Resign this game?')) room?.resign(); };
  $('wait-bot').onclick = () => room?.playBot();
  $('wait-cancel').onclick = () => leaveRoom('');
  $('share').onclick = () => startng.share({ text: 'I just played draughts on start.ng. Play me!' });
  $('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(room?.inviteUrl() ?? '');
      $('copy').textContent = 'Link copied';
    } catch {
      $('copy').textContent = room?.inviteUrl() ?? 'Copy failed';
    }
    setTimeout(() => { $('copy').textContent = 'Copy invite link'; }, 2000);
  };

  // ---------- start ----------

  async function start() {
    if (!window.startng) { problem('start.ng could not load. Check your connection.'); return; }
    const player = await startng.getPlayer();
    const code = startng.rooms.codeFromUrl();
    if (code && player?.user) joinRoom(code);
    else if (code) {
      $('invite').textContent = `You were invited to a game (room ${code}).`;
      $('invite').hidden = false;
      needSignIn('Sign in with start.ng to join your friend.');
    }
    clearInterval(onlineTimer);
    onlineTimer = setInterval(() => { if (!$('lobby').hidden) refreshOnline(); }, 10000);
    refreshOnline();
  }

  if (window.startng) start();
  else addEventListener('load', start);
})();
