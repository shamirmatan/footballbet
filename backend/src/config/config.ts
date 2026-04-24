import dotenv from 'dotenv';

dotenv.config();

const MONGO_USERNAME = process.env.MONGO_USERNAME || '';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || '';
const MONGO_URL = `mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@cluster0.cdkdcng.mongodb.net`;
const SERVER_PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 3000;

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const FOOTBALL_DATA_BASE_URL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'WC';

export const config = {
    mongo: {
        username: MONGO_USERNAME,
        password: MONGO_PASSWORD,
        url: MONGO_URL
    },
    server: {
        port: SERVER_PORT
    },
    footballData: {
        apiKey: FOOTBALL_DATA_API_KEY,
        baseUrl: FOOTBALL_DATA_BASE_URL,
        competition: FOOTBALL_DATA_COMPETITION
    }
};
