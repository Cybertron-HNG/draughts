# Draughts on start.ng

English draughts (also called checkers). Play a friend with a link, find a match, or play the bot. It will live at `draughts.start.ng`.

**The rules used** (also on the game's page): 8 x 8 board, pieces on the dark squares, 12 men each. A man moves one square diagonally forward; a king one square in any direction. A capture jumps an adjacent enemy piece into the empty square behind it; a man captures forwards only, a king both ways. **Captures are compulsory** and a piece must keep jumping while it can. A man that reaches the far rank becomes a king and that ends the turn. You win when the other side has no pieces or no move; 40 moves each with no capture and no man moved is a draw.

Every game runs in a room on start.ng's server, which checks each move, and a player who drops can come back (10 minutes). Players need to be signed in with start.ng, and the bot needs a sign-in too (it runs on the server).

A plain HTML, CSS and JavaScript game (no build step) that loads the start.ng Kit (`https://start.ng/kit.js`). The rules live on the server (`startng-be`, `app/features/rooms/games/draughts.py`).

A move is `{ "path": ["c3", "e5"] }`: the piece's square, then each square it lands on. The page gets the list of legal moves in the state (`moves`) and builds the path from clicks.

## Publish
On start.ng, sign in, open **Your games** and paste this repo's link. The repo must be named `draughts`.

| File | What it does |
| --- | --- |
| `index.html` | The page: lobby, waiting room, board |
| `game.js` | The lobby, rooms (through `startng.rooms`), the board and building a jump |
| `style.css` | The look |
| `startng.json` | The description shown on the game's page |
