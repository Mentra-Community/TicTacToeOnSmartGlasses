// augmentos_cloud/packages/apps/tictactoe/src/index.ts
import path from 'path';
import {
  TpaServer,
  TpaSession,
  StreamType,
  ViewType,
  createTranscriptionStream,
} from '@augmentos/sdk';
import { fetchSettings, getUserDifficulty, UserSettings } from './settings_handler';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

// Validate required environment variables
if (!PACKAGE_NAME) {
  throw new Error('PACKAGE_NAME environment variable is required');
}
if (!AUGMENTOS_API_KEY) {
  throw new Error('AUGMENTOS_API_KEY environment variable is required');
}
// TicTacToeManager class to handle the game logic
class TicTacToeManager {
  private board: string[];
  private currentPlayer: 'X' | 'O';
  private gameOver: boolean;
  private winner: string | null;
  private difficulty: string;
  private userSymbol: 'X' | 'O'; // Track which symbol the user is playing
  private aiSymbol: 'X' | 'O';   // Track which symbol the AI is playing
  private isFirstMove: boolean = true;  // Add this to track first move
  private lastError: string | null = null;  // Add this field
  
  constructor(difficulty: string = 'Easy') {
    this.board = Array(9).fill('');
    this.userSymbol = Math.random() < 0.5 ? 'X' : 'O'; // Randomly assign X or O to user
    this.aiSymbol = this.userSymbol === 'X' ? 'O' : 'X';
    this.currentPlayer = 'X'; // X always goes first
    this.gameOver = false;
    this.winner = null;
    this.difficulty = difficulty;
  }
  
  getCurrentBoardDisplay(): string {
    let display = '';
    
    // Just show the grid
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const index = i * 3 + j;
        const cell = this.board[index] || (index + 1).toString();
        display += ` ${cell} `;
        if (j < 2) display += '│';
      }
      // Add horizontal line after first and second rows
      if (i < 2) display += '\n───────';
      display += '\n';
    }
    
    return display.trimEnd();
  }
  
  showMessage(session: TpaSession): void {
    let message = '';
    
    // Show turn message only for first move
    if (this.isFirstMove) {
      message = this.userSymbol === 'X' ? 
        "You start first!" : 
        "AI starts first!";
      this.isFirstMove = false;
      
      if (message) {
        this.showGameToUser(session, message);
        // After 1.5 seconds, show the grid
        setTimeout(() => {
          this.showGameToUser(session, this.getCurrentBoardDisplay());
        }, 1500);
      }
    }
    // Show game over messages (without showing grid after)
    else if (this.gameOver) {
      // First show the final board position
      this.showGameToUser(session, this.getCurrentBoardDisplay());
      
      // After 1.5 seconds, show the winner message
      setTimeout(() => {
        if (this.winner) {
          message = `${this.winner === this.userSymbol ? 'YOU WIN!' : 'AI WINS!'} Say 'new game'`;
        } else {
          message = "It's a DRAW! Say 'new game'";
        }
        this.showGameToUser(session, message);
      }, 1500);
    }
    // Show error messages for invalid moves
    else if (this.lastError) {
      message = this.lastError;
      this.lastError = null;
      
      if (message) {
        this.showGameToUser(session, message);
        // After 1.5 seconds, show the grid
        setTimeout(() => {
          this.showGameToUser(session, this.getCurrentBoardDisplay());
        }, 1500);
      }
    }
  }

  // Show game board or messages
  showGameToUser(session: TpaSession, text: string): void {
    console.log(`Game board to show: \n${text}`);
    session.layouts.showTextWall(text, {
      view: ViewType.MAIN,
      durationMs: 60 * 1000, // 60 seconds timeout
    });
  }
  
  makeMove(position: number, session: TpaSession): boolean {
    // Check if it's the user's turn
    if (this.currentPlayer !== this.userSymbol || this.gameOver) {
      this.showGameToUser(session, "Not your turn!");
      if (!this.gameOver) {
        setTimeout(() => {
          this.showGameToUser(session, this.getCurrentBoardDisplay());
        }, 1500);
      }
      return false;
    }
    
    // Position should be 1-9, convert to 0-8 for array index
    const index = position - 1;
    
    // Check if the move is valid
    if (index < 0 || index > 8 || this.board[index] !== '') {
      this.showGameToUser(session, "Invalid move!");
      setTimeout(() => {
        this.showGameToUser(session, this.getCurrentBoardDisplay());
      }, 1500);
      return false;
    }
    
    // Make the move
    this.board[index] = this.currentPlayer;
    this.checkGameState();
    
    if (!this.gameOver) {
      this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    }
    
    return true;
  }
  
  makeAIMove(): boolean {
    if (this.gameOver || this.currentPlayer !== this.aiSymbol) {
      return false;
    }
    
    let moveIndex: number;
    
    switch (this.difficulty) {
      case 'Impossible':
        moveIndex = this.getBestMove();
        break;
      case 'Medium':
        // 70% chance of best move, 30% chance of random move
        moveIndex = Math.random() < 0.7 
          ? this.getBestMove()
          : this.findRandomMove();
        break;
      case 'Easy':
      default:
        moveIndex = this.findRandomMove();
        break;
    }
    
    if (moveIndex >= 0) {
      this.board[moveIndex] = this.aiSymbol;
      this.checkGameState();
      
      if (!this.gameOver) {
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
      }
      
      return true;
    }
    
    return false;
  }
  
  private findRandomMove(): number {
    // Find all empty cells
    const emptyCells = this.board
      .map((cell, index) => cell === '' ? index : -1)
      .filter(index => index >= 0);
    
    if (emptyCells.length === 0) {
      return -1;
    }
    
    // Pick a random empty cell
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
  }
  
  private getBestMove(): number {
    let bestScore = -Infinity;
    let bestMove = -1;

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === '') {
        this.board[i] = this.aiSymbol;
        let score = this.minimax(this.board, 0, false);
        this.board[i] = '';
        
        if (score > bestScore) {
          bestScore = score;
          bestMove = i;
        }
      }
    }
    
    return bestMove;
  }

  private minimax(board: string[], depth: number, isMaximizing: boolean): number {
    const result = this.checkWinner();
    
    if (result !== null) {
      if (result === this.aiSymbol) return 10 - depth;
      if (result === this.userSymbol) return depth - 10;
      if (result === 'draw') return 0;
    }

    if (isMaximizing) {
      let bestScore = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = this.aiSymbol;
          let score = this.minimax(board, depth + 1, false);
          board[i] = '';
          bestScore = Math.max(score, bestScore);
        }
      }
      return bestScore;
    } else {
      let bestScore = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === '') {
          board[i] = this.userSymbol;
          let score = this.minimax(board, depth + 1, true);
          board[i] = '';
          bestScore = Math.min(score, bestScore);
        }
      }
      return bestScore;
    }
  }

  private checkWinner(): string | null {
    // Check rows
    for (let i = 0; i < 9; i += 3) {
      if (this.board[i] && this.board[i] === this.board[i + 1] && this.board[i] === this.board[i + 2]) {
        return this.board[i];
      }
    }
    
    // Check columns
    for (let i = 0; i < 3; i++) {
      if (this.board[i] && this.board[i] === this.board[i + 3] && this.board[i] === this.board[i + 6]) {
        return this.board[i];
      }
    }
    
    // Check diagonals
    if (this.board[0] && this.board[0] === this.board[4] && this.board[0] === this.board[8]) {
      return this.board[0];
    }
    if (this.board[2] && this.board[2] === this.board[4] && this.board[2] === this.board[6]) {
      return this.board[2];
    }
    
    // Check for draw
    if (this.board.every(cell => cell !== '')) {
      return 'draw';
    }
    
    return null;
  }
  
  private checkGameState(): void {
    const result = this.checkWinner();
    if (result) {
      this.gameOver = true;
      this.winner = result === 'draw' ? null : result;
    }
  }
  
  resetGame(): void {
    this.board = Array(9).fill('');
    this.userSymbol = Math.random() < 0.5 ? 'X' : 'O'; // Randomly assign X or O to user
    this.aiSymbol = this.userSymbol === 'X' ? 'O' : 'X';
    this.currentPlayer = 'X'; // X always goes first
    this.gameOver = false;
    this.winner = null;
    this.isFirstMove = true;  // Reset first move flag
    
    // If AI starts (user is O), make AI's first move
    if (this.userSymbol === 'O') {
      this.makeAIMove();
    }
  }
  
  setDifficulty(difficulty: string): void {
    this.difficulty = difficulty;
  }
  
  getDifficulty(): string {
    return this.difficulty;
  }
  
  isGameOver(): boolean {
    return this.gameOver;
  }
  
  isUserTurn(): boolean {
    return this.currentPlayer === this.userSymbol;
  }
  
  getUserSymbol(): 'X' | 'O' {
    return this.userSymbol;
  }

  getCurrentPlayer(): 'X' | 'O' {
    return this.currentPlayer;
  }

  getBoard(): string[] {
    return this.board;
  }

  getAISymbol(): 'X' | 'O' {
    return this.aiSymbol;
  }
}

// Track user game managers
const userGameManagers: Map<string, TicTacToeManager> = new Map();

/**
 * TicTacToeApp - Main application class that extends TpaServer
 */
class TicTacToeApp extends TpaServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME!,
      apiKey: AUGMENTOS_API_KEY!,
      port: PORT,
      publicDir: path.resolve(__dirname, './public'),
    });
  }

  /**
   * Called by TpaServer when a new session is created
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n🎮🎮🎮 Received Tic Tac Toe session request for user ${userId}, session ${sessionId}\n\n`);

    try {
      // Fetch and apply settings for the session
      await fetchSettings(userId);
      
      // Create or update game manager with user settings
      const difficulty = getUserDifficulty(userId);
      
      let gameManager = userGameManagers.get(userId);
      if (!gameManager) {
        gameManager = new TicTacToeManager(difficulty);
        userGameManagers.set(userId, gameManager);
      } else {
        gameManager.setDifficulty(difficulty);
      }

      // Subscribe to transcription events
      const transcriptionStream = createTranscriptionStream("en-US") as unknown as StreamType;
      session.subscribe(transcriptionStream);

      // Register transcription handler
      const cleanup = session.events.onTranscription((data: any) => {
        this.handleTranscription(session, sessionId, userId, data);
      });

      // Add cleanup handler
      this.addCleanupHandler(cleanup);

      // Show initial message and grid
      gameManager.showMessage(session);
      
      // If AI starts, make its move after the message
      if (gameManager.getCurrentPlayer() !== gameManager.getUserSymbol()) {
        setTimeout(() => {
          if (gameManager) {
            gameManager.makeAIMove();
            gameManager.showGameToUser(session, gameManager.getCurrentBoardDisplay());
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error initializing session:', error);
    }
  }

  /**
   * Called by TpaServer when a session is stopped
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`Session ${sessionId} stopped: ${reason}`);
  }

  /**
   * Handles transcription data from the AugmentOS cloud
   */
  private handleTranscription(
    session: TpaSession, 
    sessionId: string, 
    userId: string, 
    transcriptionData: any
  ): void {
    const isFinal = transcriptionData.isFinal;
    const text = transcriptionData.text.toLowerCase().trim();
    const language = transcriptionData.transcribeLanguage || 'en-US';

    console.log(`[Session ${sessionId}]: Received transcription in language: ${language} - ${text} (isFinal: ${isFinal})`);
    
    // Only process final transcriptions
    if (!isFinal) return;
    
    const gameManager = userGameManagers.get(userId);
    if (!gameManager) return;
    
    // Check for game commands
    if (text.toLowerCase().replace(/[^a-z0-9]/g, '').includes('newgame') || 
        text.toLowerCase().replace(/[^a-z0-9]/g, '').includes('restart')) {
      gameManager.resetGame();
      gameManager.showMessage(session);
      return;
    }
    
    // Check if the game is over
    if (gameManager.isGameOver()) {
      gameManager.showMessage(session);
      return;
    }
    
    // Check if it's the user's turn
    if (!gameManager.isUserTurn()) {
      gameManager.showGameToUser(session, "Not your turn!");
      setTimeout(() => {
        gameManager.showGameToUser(session, gameManager.getCurrentBoardDisplay());
      }, 1500);
      return;
    }
    
    // Extract the first number from the transcript
    const match = text.match(/\d/);
    if (match) {
      const move = parseInt(match[0]);
      if (move >= 1 && move <= 9) {
        // Check if the position is already taken by the AI
        const index = move - 1;
        const board = gameManager.getBoard();
        if (board[index] === gameManager.getAISymbol()) {
          gameManager.showGameToUser(session, "Position already taken!");
          setTimeout(() => {
            gameManager.showGameToUser(session, gameManager.getCurrentBoardDisplay());
          }, 1500);
          return;
        }
        
        // Make the player's move
        const moveSuccess = gameManager.makeMove(move, session);
        
        if (moveSuccess) {
          // Show the updated board
          gameManager.showGameToUser(session, gameManager.getCurrentBoardDisplay());
          
          // If game is over after player's move, show the message
          if (gameManager.isGameOver()) {
            setTimeout(() => {
              gameManager.showMessage(session);
            }, 1000);
            return;
          }
          
          // If the game is not over, let the AI make a move
          setTimeout(() => {
            if (!gameManager.isGameOver()) {
              gameManager.makeAIMove();
              gameManager.showGameToUser(session, gameManager.getCurrentBoardDisplay());
              
              // If game is over after AI's move, show the message
              if (gameManager.isGameOver()) {
                setTimeout(() => {
                  gameManager.showMessage(session);
                }, 1000);
              }
            }
          }, 1000);
        }
      }
    }
  }

  /**
   * Handles settings updates
   */
  public async updateSettings(userId: string): Promise<any> {
    try {
      console.log('Received settings update for user:', userId);
      
      // Fetch and apply new settings
      await fetchSettings(userId);
      
      // Get updated settings
      const difficulty = getUserDifficulty(userId);
      
      // Update game manager with new settings
      let gameManager = userGameManagers.get(userId);
      if (gameManager) {
        gameManager.setDifficulty(difficulty);
      }
      
      return {
        status: 'settings updated',
        difficulty
      };
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }
}

// Create and start the app
const ticTacToeApp = new TicTacToeApp();

// Add settings endpoint
const expressApp = ticTacToeApp.getExpressApp();
expressApp.post('/settings', async (req: any, res: any) => {
  try {
    const { userIdForSettings } = req.body;

    if (!userIdForSettings) {
      return res.status(400).json({ error: 'Missing userIdForSettings in payload' });
    }

    const result = await ticTacToeApp.updateSettings(userIdForSettings);
    res.json(result);
  } catch (error) {
    console.error('Error in settings endpoint:', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

// Add a route to verify the server is running
expressApp.get('/health', (req: any, res: any) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

// Start the server
ticTacToeApp.start().then(() => {
  console.log(`${PACKAGE_NAME} server running on port ${PORT}`);
}).catch(error => {
  console.error('Failed to start server:', error);
});
