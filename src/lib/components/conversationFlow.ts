/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConversationState, ConversationStep } from '@/types';
import { FlowManager } from '@/lib/utils/flowManager';
import { db } from '@/lib/db/operations';

export class ConversationFlow {
  private state: ConversationState;
  
  constructor(userId: string) {
    this.state = {
      userId,
      currentStep: 'initial',
      context: {}
    };
  }
  
  async initialize(): Promise<void> {
    const savedState = await db.conversations.getState(this.state.userId);
    if (savedState) {
      this.state = savedState;
    }
  }
  
  async saveState(): Promise<void> {
    await db.conversations.updateState(this.state);
  }
  
  getCurrentStep(): ConversationStep {
    return this.state.currentStep;
  }
  
  getContext(): Record<string, any> {
    return this.state.context;
  }
  
  updateContext(key: string, value: any): void {
    this.state.context[key] = value;
  }
  
  async nextStep(userIntent: string): Promise<ConversationStep> {
    const nextStep = FlowManager.getNextStep(this.state.currentStep, userIntent);
    this.state.currentStep = nextStep;
    await this.saveState();
    return nextStep;
  }
  
  async backStep(): Promise<ConversationStep | null> {
    const previousStep = FlowManager.getPreviousStep(this.state.currentStep);
    if (previousStep) {
      this.state.currentStep = previousStep;
      await this.saveState();
    }
    return previousStep;
  }
  
  canGoBack(): boolean {
    return FlowManager.canGoBack(this.state.currentStep);
  }
  
  getStepPrompt(): string {
    return FlowManager.getStepPrompt(this.state.currentStep);
  }
  
  reset(): void {
    this.state.currentStep = 'initial';
    this.state.context = {};
    this.saveState();
  }
}