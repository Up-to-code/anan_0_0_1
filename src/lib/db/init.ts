import { db } from './operations';

export async function initializeDatabase() {
  try {
    await db.properties.seed();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }
}