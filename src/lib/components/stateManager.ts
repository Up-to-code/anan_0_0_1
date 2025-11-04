/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConversationState } from '@/types';
import { db } from '@/lib/db/operations';

export class StateManager {
  static async getState(userId: string): Promise<ConversationState> {
    let state = await db.conversations.getState(userId);
    
    if (!state) {
      state = {
        userId,
        currentStep: 'initial',
        context: {}
      };
      await db.conversations.updateState(state);
    }
    
    return state;
  }
  
  static async updateState(state: ConversationState): Promise<void> {
    await db.conversations.updateState(state);
  }
  
  static async resetState(userId: string): Promise<void> {
    const state: ConversationState = {
      userId,
      currentStep: 'initial',
      context: {}
    };
    await db.conversations.updateState(state);
  }
  
  static async addContext(userId: string, key: string, value: any): Promise<void> {
    const state = await this.getState(userId);
    state.context[key] = value;
    await this.updateState(state);
  }
  
  static async getContext(userId: string, key?: string): Promise<any> {
    const state = await this.getState(userId);
    return key ? state.context[key] : state.context;
  }
}