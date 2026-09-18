import unittest
from unittest.mock import patch
import budget
import server
from test_server import fixture_files, file, valid_plan
import json

INFO = {'general.architecture': 'qwen2', 'qwen2.context_length': 32768}


class BudgetTests(unittest.TestCase):
    def setUp(self):
        for key, value in [('_observed_ratio', 0), ('_samples', 0), ('CONTEXT_REQUEST', 12288)]:
            p = patch.object(budget, key, value); p.start(); self.addCleanup(p.stop)

    def test_capacity_and_accounting(self):
        b = budget.inspect('a'*300, INFO)
        self.assertEqual(b['context'], 12288)
        self.assertEqual(b['model_max'], 32768)
        self.assertEqual(b['prompt_estimate'], 100)
        self.assertEqual(b['prompt_budget'] + b['output_reserve'] + b['template_reserve'] + b['safety_reserve'], b['context'])
        self.assertTrue(b['fits'])
        small = budget.inspect('a'*300, {**INFO, 'qwen2.context_length':2048})
        self.assertEqual(small['context'], 2048)
        self.assertFalse(small['fits'])

    def test_boundary(self):
        available = budget.inspect('x', INFO)['prompt_budget']
        self.assertTrue(budget.inspect('a'*(available*3), INFO)['fits'])
        self.assertFalse(budget.inspect('a'*(available*3+1), INFO)['fits'])

    def test_unicode_and_calibration(self):
        self.assertGreater(budget.baseline('研究'*100), budget.baseline('ab'*100))
        budget.observe('a'*300, 150)
        b = budget.inspect('a'*300, INFO)
        self.assertEqual(b['prompt_estimate'], 150)
        self.assertEqual(b['calibration_samples'], 1)
        budget.observe('a'*300, 10)
        self.assertEqual(budget.inspect('a'*300, INFO)['prompt_estimate'], 150)

    def test_unknown_model_capacity_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'capacity'):
            budget.inspect('test', {})

    def test_preview_keeps_text_when_over_budget(self):
        files = fixture_files(); files['reading'] = file('big.txt', 'Study this material. '*2000)
        with patch('server.ollama', return_value={'model_info':INFO}):
            result = server.preview(files)
        self.assertFalse(result['budget']['fits'])
        self.assertEqual(sum(len(c['text'].split()) for c in result['sources']['reading']['chunks']), 6000)

    def test_syllabus_can_borrow_unused_reading_space(self):
        files = fixture_files(); files['syllabus'] = file('goals.txt', 'Learning objective. '*400)
        with patch('server.ollama', return_value={'model_info':INFO}):
            result = server.preview(files)
        self.assertTrue(result['budget']['fits'])
        self.assertGreater(sum(len(c['text']) for c in result['sources']['syllabus']['chunks']), 6000)

    def test_preview_without_ollama_still_shows_sources(self):
        with patch('server.ollama', side_effect=OSError('offline')):
            result = server.preview(fixture_files())
        self.assertIn('sources', result)
        self.assertFalse(result['budget']['fits'])
        self.assertIn('Start Ollama', result['budget']['error'])

    def test_generation_rechecks_and_does_not_call_model_when_too_large(self):
        files = fixture_files(); files['syllabus'] = file('big.txt', 'source '*12000)
        with patch('server.ollama', return_value={'model_info':INFO}) as request:
            with self.assertRaisesRegex(ValueError, 'Nothing was silently truncated'):
                server.generate(server.prepare(files)['sources'])
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.args[0], 'show')

    def test_actual_usage_and_runtime_context(self):
        usage = {}
        with patch('server.ollama', side_effect=[{'model_info':INFO}, {
            'response':json.dumps(valid_plan()), 'prompt_eval_count':1500,
            'eval_count':600, 'total_duration':2_000_000_000}]) as request:
            server.generate(server.prepare(fixture_files())['sources'], usage)
        self.assertEqual(request.call_args.args[1]['options']['num_ctx'], usage['budget']['context'])
        self.assertEqual(usage['actual_prompt_tokens'], 1500)
        self.assertEqual(usage['generation_seconds'], 2)
        self.assertEqual(budget._samples, 1)

    def test_measured_near_full_prompt_is_rejected(self):
        with patch('server.ollama', side_effect=[{'model_info':INFO}, {
            'response':json.dumps(valid_plan()), 'prompt_eval_count':12000}]):
            with self.assertRaisesRegex(ValueError, 'Nothing was published'):
                server.generate(server.prepare(fixture_files())['sources'])
        self.assertEqual(budget._samples, 0)

    def test_partial_output_is_not_published(self):
        with patch('server.ollama', side_effect=[{'model_info':INFO}, {
            'response':json.dumps(valid_plan()), 'prompt_eval_count':1500, 'done_reason':'length'}]):
            with self.assertRaisesRegex(ValueError, 'response space'):
                server.generate(server.prepare(fixture_files())['sources'])


if __name__ == '__main__': unittest.main()
