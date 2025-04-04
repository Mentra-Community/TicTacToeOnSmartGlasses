import axios from 'axios';

const PACKAGE_NAME = 'com.augmentos.tictactoe';
const CLOUD_HOST_NAME = process.env.CLOUD_HOST_NAME || 'cloud';

// Define the settings interface
interface UserSettings {
  difficulty: string;
}

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  difficulty: 'Easy'
};

// Store user settings in memory
const userSettingsMap = new Map<string, UserSettings>();

/**
 * Fetches and applies settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
async function fetchSettings(userId: string): Promise<UserSettings> {
  try {
    // Fetch user settings from the cloud
    const response = await axios.get(`http://${CLOUD_HOST_NAME}/tpasettings/user/${PACKAGE_NAME}`, {
      headers: { Authorization: `Bearer ${userId}` }
    });

    const settings = response.data.settings;
    console.log(`Fetched settings for userId ${userId}:`, settings);

    // Find the relevant settings
    const difficultySetting = settings.find((s: any) => s.key === 'difficulty');

    // Create settings object with defaults if not found
    const userSettings: UserSettings = {
      difficulty: difficultySetting?.value || DEFAULT_SETTINGS.difficulty
    };

    // Store the settings for this user
    userSettingsMap.set(userId, userSettings);
    console.log(`Settings for user ${userId}:`, userSettings);

    return userSettings;
  } catch (err) {
    console.error(`Error fetching settings for userId ${userId}:`, err);

    // Fallback to default values
    userSettingsMap.set(userId, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Gets the current settings for a user
 * @param userId The user ID
 * @returns The user settings object
 */
function getUserSettings(userId: string): UserSettings {
  return userSettingsMap.get(userId) || DEFAULT_SETTINGS;
}

/**
 * Gets the difficulty level for a user
 * @param userId The user ID
 * @returns The difficulty level (Easy, Medium, or Impossible)
 */
function getUserDifficulty(userId: string): string {
  return getUserSettings(userId).difficulty;
}

export {
  fetchSettings,
  getUserSettings,
  getUserDifficulty,
  UserSettings
};
