export function validateEnvironment(): void {
    const required = [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_TOKEN',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
      'DATABASE_URL'
    ];
  
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error('❌ Missing environment variables:', missing);
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Environment variables validated');
  }