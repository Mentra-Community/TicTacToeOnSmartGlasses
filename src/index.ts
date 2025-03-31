// augmentos_cloud/packages/apps/tictactoe/src/index.ts
import express from 'express';
import WebSocket from 'ws';
import path from 'path';
import { TicTacToe } from 'tictactoe-ai';

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
  private ai: TicTacToe;
  
  constructor(difficulty: string = 'Easy') {
    this.board = Array(9).fill('');
    this.userSymbol = Math.random() < 0.5 ? 'X' : 'O'; // Randomly assign X or O to user
    this.aiSymbol = this.userSymbol === 'X' ? 'O' : 'X';
    this.currentPlayer = 'X'; // X always goes first
    this.gameOver = false;
    this.winner = null;
    this.difficulty = difficulty;
    this.ai = new TicTacToe();
  }
  
  getCurrentBoardDisplay(): string {
    // Create a visual representation of the board with numbers for empty spaces
    let display = "TIC TAC TOE\n";
    
    // First line: Show player symbol and current turn
    if (this.gameOver) {
      if (this.winner) {
        if (this.winner === this.userSymbol) {
          display += "YOU WIN! Say 'new game'\n";
        } else {
          display += "AI WINS! Say 'new game'\n";
        }
      } else {
        display += "DRAW! Say 'new game'\n";
      }
    } else {
      display += `You: ${this.userSymbol} | ${this.currentPlayer === this.userSymbol ? "YOUR TURN" : "AI'S TURN"}\n`;
    }
    
    // Second line: Game board row 1
    let row1 = '';
    for (let j = 0; j < 3; j++) {
      const cell = this.board[j] || (j + 1).toString();
      row1 += ` ${cell} `;
      if (j < 2) row1 += '|';
    }
    display += row1 + '\n';
    
    // Third line: Game board row 2
    let row2 = '';
    for (let j = 3; j < 6; j++) {
      const cell = this.board[j] || (j + 1).toString();
      row2 += ` ${cell} `;
      if (j < 5) row2 += '|';
    }
    display += row2 + '\n';
    
    // Fourth line: Game board row 3
    let row3 = '';
    for (let j = 6; j < 9; j++) {
      const cell = this.board[j] || (j + 1).toString();
      row3 += ` ${cell} `;
      if (j < 8) row3 += '|';
    }
    display += row3 + '\n';
    
    // Fifth line: Instructions
    display += "Say 1-9 to place mark";
    
    return display;
  }
  
  makeMove(position: number): boolean {
    // Check if it's the user's turn
    if (this.currentPlayer !== this.userSymbol || this.gameOver) {
      return false;
    }
    
    // Position should be 1-9, convert to 0-8 for array index
    const index = position - 1;
    
    // Check if the move is valid
    if (index < 0 || index > 8 || this.board[index] !== '') {
      return false;
    }
    
    // Make the move
    this.board[index] = this.currentPlayer;
    
    // Check for a win or draw
    this.checkGameState();
    
    // Switch player if game is not over
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
        // Use the AI's best move
        moveIndex = this.ai.getBestMove(this.board, this.aiSymbol);
        break;
      case 'Medium':
        // 70% chance of best move, 30% chance of random move
        moveIndex = Math.random() < 0.7 
          ? this.ai.getBestMove(this.board, this.aiSymbol)
          : this.findRandomMove();
        break;
      case 'Easy':
      default:
        // Just make a random valid move
        moveIndex = this.findRandomMove();
        break;
    }
    
    // Make the move
    if (moveIndex >= 0) {
      this.board[moveIndex] = this.aiSymbol;
      this.checkGameState();
      
      // Switch player if game is not over
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
  
  private checkWinner(): string | null {
    // Use the AI library's check for winner
    const result = this.ai.getWinner(this.board);
    if (result === 'draw') return 'draw';
    if (result === this.userSymbol) return this.userSymbol;
    if (result === this.aiSymbol) return this.aiSymbol;
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
      
      // Display the initial game board
      setTimeout(() => {
        const gameManager = userGameManagers.get(userId);
        if (gameManager) {
          showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        }
      }, 1000);
      
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
  if (text === 'new game' || text === 'restart') {
    gameManager.resetGame();
    showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
    return;
  }
  
  // Check if the game is over
  if (gameManager.isGameOver()) {
    showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
    return;
  }
  
  // Check if it's the user's turn
  if (!gameManager.isUserTurn()) {
    showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay() + "\n\nPlease wait for AI's move.");
    return;
  }
  
  // Check for move commands (numbers 1-9)
  const move = parseInt(text);
  if (!isNaN(move) && move >= 1 && move <= 9) {
    // Make the player's move
    const moveSuccess = gameManager.makeMove(move);
    
    if (moveSuccess) {
      // Show the updated board
      showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
      
      // If the game is not over, let the AI make a move
      setTimeout(() => {
        if (!gameManager.isGameOver()) {
          gameManager.makeAIMove();
          showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay());
        }
      }, 1000); // Small delay for better UX
    } else {
      // Invalid move, show the current board again
      showGameToUser(sessionId, ws, gameManager.getCurrentBoardDisplay() + "\n\nInvalid move. Try again.");
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
