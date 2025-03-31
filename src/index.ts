// augmentos_cloud/packages/apps/tictactoe/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';

import {
  TpaConnectionInit,
  DisplayRequest,
  TpaToCloudMessageType,
  CloudToTpaMessageType,
  ViewType,
  LayoutType,
  TpaSubscriptionUpdate,
  createTranscriptionStream,
  ExtendedStreamType,
  StreamType,
  DataStream,
} from './sdk';
import { fetchSettings, getUserDifficulty } from './settings_handler';

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
  
  showMessage(ws: WebSocket, sessionId: string): void {
    let message = '';
    
    // Show turn message only for first move
    if (this.isFirstMove) {
      message = this.userSymbol === 'X' ? 
        "You start first!" : 
        "AI starts first!";
      this.isFirstMove = false;
      
      if (message) {
        showGameToUser(sessionId, ws, message);
        // After 1.5 seconds, show the grid
        setTimeout(() => {
          showGameToUser(sessionId, ws, this.getCurrentBoardDisplay());
        }, 1500);
      }
    }
    // Show game over messages (without showing grid after)
    else if (this.gameOver) {
      if (this.winner) {
        message = `${this.winner === this.userSymbol ? 'YOU WIN!' : 'AI WINS!'} Say 'new game'`;
      } else {
        message = "It's a DRAW! Say 'new game'";
      }
      showGameToUser(sessionId, ws, message);
    }
    // Show error messages for invalid moves
    else if (this.lastError) {
      message = this.lastError;
      this.lastError = null;
      
      if (message) {
        showGameToUser(sessionId, ws, message);
        // After 1.5 seconds, show the grid
        setTimeout(() => {
          showGameToUser(sessionId, ws, this.getCurrentBoardDisplay());
        }, 1500);
      }
    }
  }
  
  makeMove(position: number, ws: WebSocket, sessionId: string): boolean {
    // Check if it's the user's turn
    if (this.currentPlayer !== this.userSymbol || this.gameOver) {
      showGameToUser(sessionId, ws, "Not your turn!");
      if (!this.gameOver) {
        setTimeout(() => {
          showGameToUser(sessionId, ws, this.getCurrentBoardDisplay());
        }, 1500);
      }
      return false;
    }
    
    // Position should be 1-9, convert to 0-8 for array index
    const index = position - 1;
    
    // Check if the move is valid
    if (index < 0 || index > 8 || this.board[index] !== '') {
      showGameToUser(sessionId, ws, "Invalid move!");
      setTimeout(() => {
        showGameToUser(sessionId, ws, this.getCurrentBoardDisplay());
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

const app = express();
const PORT = 80; // Default http port.
const PACKAGE_NAME = 'com.augmentos.tictactoe';
const API_KEY = 'test_key'; // In production, this would be securely stored

// Track user game managers
const userGameManagers: Map<string, TicTacToeManager> = new Map();
const userSessions = new Map<string, Set<string>>(); // userId -> Set<sessionId>

// Parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, './public')));

// Track active sessions
const activeSessions = new Map<string, WebSocket>();

// Handle webhook call from AugmentOS Cloud
app.post('/webhook', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    console.log(`\n\n🎮🎮🎮 Received Tic Tac Toe session request for user ${userId}, session ${sessionId}\n\n`);

    // Start WebSocket connection to cloud
    const ws = new WebSocket(`ws://cloud/tpa-ws`);

    ws.on('open', async () => {
      console.log(`\n[Session ${sessionId}]\n connected to augmentos-cloud\n`);
      // Send connection init with session ID
      const initMessage: TpaConnectionInit = {
        type: TpaToCloudMessageType.CONNECTION_INIT,
        sessionId,
        packageName: PACKAGE_NAME,
        apiKey: API_KEY
      };

      console.log(`Sending connection init message to augmentos-cloud for session ${sessionId}`);
      console.log(JSON.stringify(initMessage));
      ws.send(JSON.stringify(initMessage));

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

      // Show initial message and grid
      gameManager.showMessage(ws, sessionId);
      
      // If AI starts, make its move after the message
      if (gameManager.getCurrentPlayer() !== gameManager.getUserSymbol()) {
        setTimeout(() => {
          gameManager.makeAIMove();
          showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        }, 2000);
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(sessionId, userId, ws, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Session ${sessionId} disconnected`);
      
      // Clean up WebSocket connection
      activeSessions.delete(sessionId);
      
      // Remove session from user's sessions map
      if (userSessions.has(userId)) {
        const sessions = userSessions.get(userId)!;
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          userSessions.delete(userId);
          // If no more sessions for this user, clean up the game manager
          userGameManagers.delete(userId);
        }
      } else {
        console.log(`Session ${sessionId} not found in userSessions map for user ${userId}`);
      }
      
      // Force garbage collection for any remaining references
      ws.removeAllListeners();
      
      console.log(`Cleanup completed for session ${sessionId}, user ${userId}`);
    });

    // Track this session for the user
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId)!.add(sessionId);

    activeSessions.set(sessionId, ws);
    
    res.status(200).json({ status: 'connecting' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function handleMessage(sessionId: string, userId: string, ws: WebSocket, message: any) {
  switch (message.type) {
    case CloudToTpaMessageType.CONNECTION_ACK: {
      const transcriptionStream = createTranscriptionStream("en-US");

      const subMessage: TpaSubscriptionUpdate = {
        type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
        packageName: PACKAGE_NAME,
        sessionId,
        subscriptions: [transcriptionStream as ExtendedStreamType]
      };
      ws.send(JSON.stringify(subMessage));
      
      // Create new game manager for this user
      const difficulty = getUserDifficulty(userId);
      const gameManager = new TicTacToeManager(difficulty);
      userGameManagers.set(userId, gameManager);
      
      // Show initial message and grid
      gameManager.showMessage(ws, sessionId);
      
      // If AI starts, make its move after the message
      if (gameManager.getCurrentPlayer() !== gameManager.getUserSymbol()) {
        setTimeout(() => {
          gameManager.makeAIMove();
          showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        }, 2000);
      }
      
      break;
    }

    case CloudToTpaMessageType.DATA_STREAM: {
      const streamMessage = message as DataStream;
      if (streamMessage.streamType === StreamType.TRANSCRIPTION) {
        handleTranscription(sessionId, userId, ws, streamMessage.data);
      }
      break;
    }

    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleTranscription(sessionId: string, userId: string, ws: WebSocket, transcriptionData: any) {
  const isFinal = transcriptionData.isFinal;
  const text = transcriptionData.text.toLowerCase().trim();
  const language = transcriptionData.transcribeLanguage || 'en-US';

  console.log(`[Session ${sessionId}]: Received transcription in language: ${language} - ${text} (isFinal: ${isFinal})`);
  
  // Only process final transcriptions
  if (!isFinal) return;
  
  const gameManager = userGameManagers.get(userId);
  if (!gameManager) return;
  
  // Check for game commands
  if (text.toLowerCase().replace(/[^a-z0-9]/g, '').includes('newgame') || text.toLowerCase().replace(/[^a-z0-9]/g, '').includes('restart')) {
    gameManager.resetGame();
    gameManager.showMessage(ws, sessionId);
    return;
  }
  
  // Check if the game is over
  if (gameManager.isGameOver()) {
    gameManager.showMessage(ws, sessionId);
    return;
  }
  
  // Check if it's the user's turn
  if (!gameManager.isUserTurn()) {
    showGameToUser(sessionId, ws, "Not your turn!");
    setTimeout(() => {
      showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
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
        showGameToUser(sessionId, ws, "Position already taken!");
        setTimeout(() => {
          showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        }, 1500);
        return;
      }
      
      // Make the player's move
      const moveSuccess = gameManager.makeMove(move, ws, sessionId);
      
      if (moveSuccess) {
        // Show the updated board
        showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        
        // If game is over after player's move, show the message
        if (gameManager.isGameOver()) {
          setTimeout(() => {
            gameManager.showMessage(ws, sessionId);
          }, 1000);
          return;
        }
        
        // If the game is not over, let the AI make a move
        setTimeout(() => {
          if (!gameManager.isGameOver()) {
            gameManager.makeAIMove();
            showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
            
            // If game is over after AI's move, show the message
            if (gameManager.isGameOver()) {
              setTimeout(() => {
                gameManager.showMessage(ws, sessionId);
              }, 1000);
            }
          }
        }, 1000);
      }
    }
  }
}

/**
 * Sends a display event (game board) to the cloud.
 */
function showGameToUser(sessionId: string, ws: WebSocket, text: string) {
  console.log(`[Session ${sessionId}]: Game board to show: \n${text}`);

  const displayRequest: DisplayRequest = {
    type: TpaToCloudMessageType.DISPLAY_REQUEST,
    view: ViewType.MAIN,
    packageName: PACKAGE_NAME,
    sessionId,
    layout: {
      layoutType: LayoutType.TEXT_WALL,
      text: text
    },
    timestamp: new Date(),
    durationMs: 60 * 1000, // 60 seconds timeout
    forceDisplay: true
  };

  ws.send(JSON.stringify(displayRequest));
}

/**
 * Refreshes all sessions for a user after settings changes.
 */
function refreshUserSessions(userId: string) {
  const sessionIds = userSessions.get(userId);
  if (!sessionIds || sessionIds.size === 0) {
    console.log(`No active sessions found for user ${userId}`);
    return false;
  }
  
  console.log(`Refreshing ${sessionIds.size} sessions for user ${userId}`);
  
  // Get the game manager
  const gameManager = userGameManagers.get(userId);
  if (!gameManager) {
    console.log(`No game manager found for user ${userId}`);
    return false;
  }
  
  // Refresh each session
  for (const sessionId of sessionIds) {
    const ws = activeSessions.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log(`Refreshing session ${sessionId}`);
      
      // Show the current game state
      showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
    } else {
      console.log(`Session ${sessionId} is not open, removing from tracking`);
      activeSessions.delete(sessionId);
      sessionIds.delete(sessionId);
    }
  }
  
  return sessionIds.size > 0;
}

app.post('/settings', async (req, res) => {
  try {
    console.log('Received settings update for Tic Tac Toe:', req.body);
    const { userIdForSettings } = req.body;
    
    // Fetch and apply new settings
    await fetchSettings(userIdForSettings);
    
    // Get updated settings
    const difficulty = getUserDifficulty(userIdForSettings);
    
    // Update game manager with new settings
    let gameManager = userGameManagers.get(userIdForSettings);
    if (gameManager) {
      gameManager.setDifficulty(difficulty);
    }
    
    // Refresh all active sessions for this user
    refreshUserSessions(userIdForSettings);
    
    res.status(200).json({ status: 'settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error updating settings' });
  }
});

// Add a route to verify the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

app.listen(PORT, () => {
  console.log(`${PACKAGE_NAME} server running on port ${PORT}`);
});

