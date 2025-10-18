# AI Integration Guide

Boorie integrates multiple AI providers to deliver context-aware assistance for hydraulic engineering tasks. This guide covers setup, usage, and advanced workflows.

## 🤖 Supported AI Providers

### OpenAI GPT Models
**Best for**: General hydraulic engineering queries, code generation, documentation

- **Models**: GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
- **Strengths**: Broad knowledge, excellent reasoning, code generation
- **Use Cases**: Design calculations, troubleshooting, documentation
- **API Key**: Required from [OpenAI Platform](https://platform.openai.com)

```typescript
// Configuration
{
  provider: 'openai',
  apiKey: 'sk-your-openai-api-key',
  model: 'gpt-4-turbo-preview',
  maxTokens: 4000,
  temperature: 0.1
}
```

### Anthropic Claude
**Best for**: Technical writing, complex analysis, regulatory compliance

- **Models**: Claude-3 Opus, Claude-3 Sonnet, Claude-3 Haiku
- **Strengths**: Technical accuracy, long context, safety-focused
- **Use Cases**: Report generation, standards compliance, detailed analysis
- **API Key**: Required from [Anthropic Console](https://console.anthropic.com)

```typescript
// Configuration
{
  provider: 'anthropic',
  apiKey: 'sk-ant-your-anthropic-key',
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4000,
  temperature: 0
}
```

### Google Gemini
**Best for**: Multimodal analysis, visual data interpretation

- **Models**: Gemini Pro, Gemini Pro Vision
- **Strengths**: Multimodal capabilities, integration with Google services
- **Use Cases**: Image analysis, diagram interpretation, data visualization
- **API Key**: Required from [Google AI Studio](https://aistudio.google.com)

```typescript
// Configuration
{
  provider: 'google',
  apiKey: 'your-google-api-key',
  model: 'gemini-pro',
  safetySettings: 'block_few'
}
```

### OpenRouter
**Best for**: Access to multiple models, cost optimization

- **Models**: All major models through one API
- **Strengths**: Model variety, competitive pricing, unified API
- **Use Cases**: Model comparison, cost-effective scaling
- **API Key**: Required from [OpenRouter](https://openrouter.ai)

```typescript
// Configuration
{
  provider: 'openrouter',
  apiKey: 'sk-or-your-openrouter-key',
  model: 'anthropic/claude-3-sonnet',
  baseURL: 'https://openrouter.ai/api/v1'
}
```

### Ollama (Local AI)
**Best for**: Privacy-sensitive projects, offline usage

- **Models**: Llama 2, Mistral, CodeLlama, custom models
- **Strengths**: Complete privacy, no API costs, customizable
- **Use Cases**: Confidential projects, air-gapped environments
- **Setup**: Install [Ollama](https://ollama.com) locally

```typescript
// Configuration
{
  provider: 'ollama',
  baseURL: 'http://localhost:11434',
  model: 'llama2:7b',
  temperature: 0.1
}
```

## ⚙️ Configuration

### 1. Provider Setup

#### In Application Settings
1. Navigate to **Settings** → **AI Providers**
2. Click **Add Provider**
3. Select provider type
4. Enter API credentials
5. Test connection
6. Set as default (optional)

#### Environment Variables
```env
# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4-turbo-preview

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Google
GOOGLE_API_KEY=your-google-api-key
GOOGLE_MODEL=gemini-pro

# OpenRouter
OPENROUTER_API_KEY=sk-or-your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3-sonnet

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2:7b
```

### 2. Model Parameters

#### Temperature Settings
- **0.0-0.2**: Precise calculations, factual responses
- **0.3-0.7**: Balanced creativity and accuracy
- **0.8-1.0**: Creative solutions, brainstorming

#### Context Window Management
- **Short Context** (1K-4K tokens): Quick calculations
- **Medium Context** (8K-16K tokens): Standard analysis
- **Long Context** (32K+ tokens): Comprehensive reports

#### Safety and Filtering
- **Strict**: Maximum safety, minimal false positives
- **Moderate**: Balanced approach (recommended)
- **Minimal**: Maximum capability, user discretion

## 💬 Chat Interface

### 1. Basic Chat
```
User: Calculate the friction loss in a 300mm diameter pipe with 150 L/s flow

AI: I'll help you calculate the friction loss for your pipe.

Given parameters:
- Pipe diameter: 300 mm (0.3 m)
- Flow rate: 150 L/s (0.15 m³/s)

Using Darcy-Weisbach equation:
hf = f × (L/D) × (V²/2g)

First, let's calculate the velocity:
Area = π × (D/2)² = π × (0.15)² = 0.0707 m²
Velocity = Q/A = 0.15/0.0707 = 2.12 m/s

[Continues with detailed calculation...]
```

### 2. Context-Aware Responses
Boorie provides automatic context about:

#### Current Project Data
- Network topology and components
- Recent simulation results
- Project specifications and constraints
- Team members and permissions

#### Regional Standards
- Local regulations and codes
- Material specifications
- Safety requirements
- Design guidelines

#### Calculation History
- Previous analysis results
- Parameter variations
- Performance comparisons
- Optimization suggestions

### 3. Advanced Chat Features

#### Multi-turn Conversations
```
User: Analyze the pressure distribution in Network-01

AI: I've analyzed the pressure distribution in your network. Here are the key findings:

1. Minimum pressure: 15.2 m at Node J-45
2. Maximum pressure: 87.3 m at Node J-12
3. 3 nodes below minimum pressure (20 m)

Would you like me to suggest solutions for the low-pressure areas?

User: Yes, focus on the most cost-effective solutions

AI: Based on cost-effectiveness analysis, here are my recommendations:

1. Install booster pump at Node J-40 (€15,000)
   - Benefits: Improves pressure for 12 nodes
   - ROI: 3.2 years

2. Increase pipe diameter from J-23 to J-45 (€8,500)
   - Benefits: Reduces head loss by 8.3 m
   - ROI: 2.1 years (recommended)

[Continues with detailed analysis...]
```

#### Document Integration
- Upload technical documents for AI analysis
- Reference standards and regulations
- Extract data from drawings and specifications
- Generate compliance reports

## 🔧 AI-Powered Tools

### 1. Intelligent Design Assistant

#### Pipe Sizing Optimization
```
User: Optimize pipe sizes for minimum cost while maintaining 20m minimum pressure

AI Response:
I'll optimize your network pipe sizes using genetic algorithm approach:

Current network cost: €145,230
Optimized network cost: €128,940 (11.3% reduction)

Recommended changes:
- Pipe P-01: 400mm → 350mm (save €3,200)
- Pipe P-15: 250mm → 300mm (cost €2,100, improves pressure)
- Pipe P-23: 200mm → 250mm (cost €1,800, eliminates bottleneck)

Net savings: €16,290
Pressure compliance: 100% (all nodes > 20m)
```

#### Pump Selection
```
User: Select optimal pump for Station PS-02 with varying demand

AI Response:
Based on your demand patterns and system curve analysis:

Recommended Pump: Grundfos NBE 125-250
- Flow range: 50-200 L/s
- Head range: 35-65 m
- Efficiency: 82% at duty point
- Variable speed drive compatible

Performance analysis:
- Peak efficiency: 84% at 150 L/s, 45m
- Annual energy cost: €8,450
- Payback period: 4.2 years vs. fixed speed

Alternative VFD schedule:
- Night (22:00-06:00): 60% speed
- Day (06:00-22:00): Variable 70-100%
- Peak hours: 100% speed with staging
```

### 2. Predictive Analytics

#### Demand Forecasting
- Historical consumption analysis
- Population growth projections
- Industrial development impact
- Climate change considerations

#### Maintenance Scheduling
- Component aging models
- Failure probability analysis
- Cost-benefit optimization
- Resource allocation planning

#### Performance Monitoring
- Real-time deviation detection
- Efficiency trend analysis
- Energy consumption optimization
- Water loss identification

### 3. Regulatory Compliance

#### Standards Checking
```
User: Check NOM-127-SSA1 compliance for residential connections

AI Response:
NOM-127-SSA1 Compliance Analysis:

✅ COMPLIANT:
- Minimum pressure: 22.5 m (required: 20 m)
- Maximum pressure: 48.3 m (limit: 50 m)
- Service continuity: 99.2% (required: 95%)

⚠️ ATTENTION REQUIRED:
- Chlorine residual: 0.18 mg/L at Node J-67 (min: 0.2 mg/L)
- Turbidity spike detected on 2024-03-15

📋 RECOMMENDATIONS:
1. Install automatic chlorination at Node J-60
2. Review filtration system at Plant WTP-01
3. Implement continuous monitoring at critical points

Documentation generated and saved to project compliance folder.
```

#### Report Generation
- Automated compliance reports
- Performance summaries
- Design documentation
- Regulatory submissions

## 📊 Analytics Integration

### 1. Microsoft Clarity Events

Boorie tracks AI usage for optimization:

```typescript
// AI interaction tracking
trackAIUsage({
  provider: 'openai',
  model: 'gpt-4-turbo',
  query_type: 'hydraulic_calculation',
  response_time: 1250,
  tokens_used: 850,
  success: true,
  user_satisfaction: 'high'
});
```

### 2. Performance Metrics
- Response quality ratings
- Query completion rates
- User engagement patterns
- Feature adoption analytics

### 3. Optimization Insights
- Most effective AI models by task type
- Common query patterns
- Error analysis and improvements
- Resource usage optimization

## 🔒 Security and Privacy

### 1. Data Protection
- API keys encrypted with OS keychain
- Project data never sent to AI providers without consent
- Local processing options available
- GDPR/CCPA compliance

### 2. Privacy Controls

#### Data Sharing Settings
```typescript
// Privacy configuration
{
  shareProjectData: false,        // Never share project details
  shareCalculationInputs: true,   // Allow calculation parameters
  shareResults: false,           // Never share simulation results
  anonymizeQueries: true,        // Remove identifying information
  localProcessingOnly: false     // Use cloud AI with privacy controls
}
```

#### Audit Trail
- All AI interactions logged
- Data sharing consent tracked
- Query history with retention controls
- Export/delete personal data options

### 3. Enterprise Features
- Single Sign-On (SSO) integration
- API usage monitoring and limits
- Team-level privacy controls
- Compliance reporting

## 🚀 Advanced Workflows

### 1. Multi-Model Ensemble

Use multiple AI providers for complex analysis:

```typescript
// Example: Design review workflow
const designReview = await Promise.all([
  openai.analyze(network, 'structural_analysis'),
  claude.analyze(network, 'compliance_check'),
  gemini.analyze(networkImage, 'visual_inspection')
]);

const consolidatedReport = await openai.synthesize(designReview);
```

### 2. Custom Model Training

For organizations with specific needs:

#### Domain Adaptation
- Fine-tune models on company standards
- Custom terminology and calculations
- Regional regulatory knowledge
- Historical project patterns

#### Ollama Custom Models
```bash
# Create custom hydraulic engineering model
ollama create hydraulic-engineer -f ./Modelfile

# Modelfile content
FROM llama2:7b
SYSTEM You are a hydraulic engineering expert specializing in water distribution systems. You follow Mexican NOM standards and use metric units.
```

### 3. API Integration

For advanced users and integrations:

```typescript
// Direct API usage
import { BoorieAI } from 'boorie-ai-sdk';

const ai = new BoorieAI({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

const analysis = await ai.analyzeNetwork({
  network: networkData,
  analysisType: 'pressure_optimization',
  constraints: {
    minPressure: 20,
    maxVelocity: 3.0,
    budget: 100000
  }
});
```

## 🛠️ Troubleshooting

### Common Issues

#### API Connection Failures
1. **Check API Key**: Verify key format and permissions
2. **Network Connectivity**: Test internet connection
3. **Rate Limits**: Monitor usage quotas
4. **Service Status**: Check provider status pages

#### Poor Response Quality
1. **Context Management**: Provide clear, specific queries
2. **Model Selection**: Use appropriate model for task type
3. **Parameter Tuning**: Adjust temperature and context length
4. **Prompt Engineering**: Refine query structure

#### Performance Issues
1. **Model Optimization**: Choose faster models for simple tasks
2. **Caching**: Enable response caching for repeated queries
3. **Batch Processing**: Group similar queries
4. **Local Processing**: Use Ollama for privacy and speed

### Debugging Tools

#### AI Response Inspector
- View raw API responses
- Analyze token usage
- Check response timing
- Validate model parameters

#### Query Optimizer
- Suggest query improvements
- Identify context inefficiencies
- Recommend model alternatives
- Optimize for cost/performance

## 📚 Best Practices

### 1. Query Design
- Be specific about requirements and constraints
- Include relevant context (units, standards, location)
- Ask for step-by-step explanations
- Request multiple solution alternatives

### 2. Model Selection
- **Quick calculations**: GPT-3.5 Turbo, Claude Haiku
- **Complex analysis**: GPT-4, Claude Sonnet/Opus
- **Visual analysis**: Gemini Pro Vision
- **Privacy-sensitive**: Ollama local models

### 3. Cost Optimization
- Use shorter context for simple queries
- Cache frequently requested calculations
- Batch similar queries together
- Monitor usage with analytics

### 4. Quality Assurance
- Always verify AI calculations independently
- Cross-reference with standards and regulations
- Review suggestions with experienced engineers
- Maintain professional judgment in decision-making

---

**Next Steps**: Explore [WNTR Integration](WNTR-Integration.md) to combine AI insights with advanced hydraulic modeling.