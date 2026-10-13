// Registers a scriptable fake LLM by overriding the built-in "anthropic" provider (the config schema only
// allows built-in provider names). Requests are appended to $FAKE_LLM_LOG (workers are separate processes).
import { appendFileSync } from 'node:fs';
import { registerProvider } from '../../src';

registerProvider('anthropic', () => ({
  name: 'fake',
  async complete(req) {
    const user = req.messages[req.messages.length - 1].content;
    if (process.env.FAKE_LLM_LOG) appendFileSync(process.env.FAKE_LLM_LOG, `${JSON.stringify({ system: req.system, user })}\n`);
    if (req.system.includes('QA assertion judge')) {
      const fail = /Condition: .*FAILME/.test(user);
      const violate = req.system.includes('VIOLATES');
      const pass = violate ? fail : !fail;
      return { text: JSON.stringify({ pass, reason: `fake-reason-${fail ? 'bad' : 'good'}` }), model: 'fake-model', inputTokens: 3, outputTokens: 2 };
    }
    if (req.system.includes('planner')) {
      return {
        text: JSON.stringify({ steps: [{ action: 'click', target: { role: 'button', name: 'Go' }, description: 'Click Go' }] }),
        model: 'fake-model',
        inputTokens: 3,
        outputTokens: 2,
      };
    }
    if (req.system.includes('locate ONE element')) {
      return { text: JSON.stringify({ target: { role: 'button', name: 'Go' }, confidence: 0.9 }), model: 'fake-model', inputTokens: 3, outputTokens: 2 };
    }
    if (req.system.includes('senior test automation engineer')) return { text: '**Likely root cause** fake analysis', model: 'fake-model' };
    return { text: '{}', model: 'fake-model' };
  },
}));
