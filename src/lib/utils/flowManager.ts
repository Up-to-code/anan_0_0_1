import { ConversationStep, ConversationState } from '@/types';

export class FlowManager {
  static getNextStep(currentStep: ConversationStep, userIntent: string): ConversationStep {
    const stepTransitions: Record<ConversationStep, Record<string, ConversationStep>> = {
      initial: {
        search: 'searching',
        property_view: 'property_selected',
        pdf_request: 'pdf_requested',
        viewing_request: 'viewing_requested',
        callback_request: 'callback_requested'
      },
      searching: {
        search_complete: 'property_selected',
        new_search: 'searching'
      },
      property_selected: {
        pdf_request: 'pdf_requested',
        viewing_request: 'viewing_requested',
        callback_request: 'callback_requested',
        new_search: 'searching'
      },
      pdf_requested: {
        complete: 'completed',
        another_pdf: 'pdf_requested'
      },
      viewing_requested: {
        complete: 'completed',
        another_viewing: 'viewing_requested'
      },
      callback_requested: {
        complete: 'completed'
      },
      completed: {
        new_search: 'searching',
        start_over: 'initial'
      }
    };
    
    return stepTransitions[currentStep]?.[userIntent] || currentStep;
  }
  
  static getPreviousStep(currentStep: ConversationStep): ConversationStep | null {
    const previousSteps: Record<ConversationStep, ConversationStep | null> = {
      initial: null,
      searching: 'initial',
      property_selected: 'searching',
      pdf_requested: 'property_selected',
      viewing_requested: 'property_selected',
      callback_requested: 'property_selected',
      completed: 'property_selected'
    };
    
    return previousSteps[currentStep];
  }
  
  static canGoBack(currentStep: ConversationStep): boolean {
    return this.getPreviousStep(currentStep) !== null;
  }
  
  static getStepPrompt(step: ConversationStep): string {
    const prompts: Record<ConversationStep, string> = {
      initial: 'كيف يمكنني مساعدتك في البحث عن عقار؟',
      searching: 'جاري البحث عن العقارات المناسبة...',
      property_selected: 'اختر الإجراء الذي تريده لهذا العقار',
      pdf_requested: 'جاري إنشاء ملف PDF...',
      viewing_requested: 'جاري حجز المعاينة...',
      callback_requested: 'سيتم التواصل معك قريباً...',
      completed: 'تم إنهاء الطلب بنجاح'
    };
    
    return prompts[step];
  }
}