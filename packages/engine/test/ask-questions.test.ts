import assert from 'node:assert/strict';
import { test } from 'node:test';

import { askQuestionId, askRequest, topicQuestion } from '../src/jev/questions.ts';

test('an ask request asks one question per post about the topic held in the state', () => {
  const request = askRequest('evals for agents', [
    { id: '11', content: { text: 'first post' } },
    { id: '22', content: { text: 'second post', quoted_post: 'quoted words' } },
  ]);
  assert.deepEqual(request.state, { topic: 'evals for agents' });
  assert.deepEqual(Object.keys(request.questions), [askQuestionId('11'), askQuestionId('22')]);
  const second = request.questions[askQuestionId('22')].instructions as Record<string, unknown>;
  assert.deepEqual(second.post, { text: 'second post', quoted_post: 'quoted words' });
  assert.notEqual(askQuestionId('11'), askQuestionId('22'));
});

test('the query travels as data, never inside a question sentence', () => {
  const query = 'what is `post`? "yes" \'; DROP';
  const request = askRequest(query, [{ id: '1', content: { text: 'a post' } }]);
  assert.equal((request.state as Record<string, unknown>).topic, query);
  const question = request.questions[askQuestionId('1')];
  assert.ok(!JSON.stringify(question).includes('DROP'));
  assert.deepEqual(JSON.parse(JSON.stringify(request)), request);
});

test('an ask question means yes and no the way a topic question does, so a pinned search keeps its meaning', () => {
  const ask = askRequest('q', [{ id: '1', content: { text: 'a post' } }]).questions[askQuestionId('1')];
  assert.deepEqual(ask.criteria, topicQuestion({ name: 'q', definition: 'q' }).criteria);
});
