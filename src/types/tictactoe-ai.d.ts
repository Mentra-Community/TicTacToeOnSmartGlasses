declare module 'tictactoe-ai' {
  export class TicTacToe {
    getBestMove(board: string[], player: 'X' | 'O'): number;
    getWinner(board: string[]): 'X' | 'O' | 'draw' | null;
  }
} 