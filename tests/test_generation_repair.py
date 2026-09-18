import copy
import io
import json
import unittest
from unittest.mock import patch
import server
from test_server import fixture_files, valid_plan


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.sources = server.prepare(fixture_files())['sources']
        self.limits = {'context':12288}

    def test_valid_plan_never_calls_model(self):
        with patch('server.model_response') as model:
            plan = server.repair_concepts(valid_plan(), self.sources, self.limits, None, {})
        model.assert_not_called()
        server.validate_plan(plan, self.sources)

    def test_exact_quote_is_relinked_without_regeneration(self):
        plan = valid_plan(); plan['concepts'][0]['source_id'] = 'R99'
        with patch('server.model_response') as model:
            fixed = server.repair_concepts(plan, self.sources, self.limits, None, {})
        model.assert_not_called()
        self.assertEqual(fixed['concepts'][0]['source_id'], 'R1')

    def test_only_invalid_concept_is_repaired_with_exact_enum_quote(self):
        plan = valid_plan(); plan['concepts'][1]['quote'] = 'A fabricated quote not in this source.'
        others = copy.deepcopy([plan['concepts'][0],plan['concepts'][2]])
        def response(payload, *args, **kwargs):
            fixed = copy.deepcopy(plan['concepts'][1])
            fixed['source_id'] = payload['format']['properties']['source_id']['enum'][0]
            fixed['quote'] = payload['format']['properties']['quote']['enum'][0]
            return {'response':json.dumps(fixed)}
        usage = {}; events = []
        with patch('server.model_response', side_effect=response) as model:
            fixed = server.repair_concepts(plan, self.sources, self.limits, events.append, usage)
        self.assertEqual(model.call_count, 1)
        self.assertEqual([fixed['concepts'][0],fixed['concepts'][2]], others)
        self.assertTrue(any('Repairing concept 2' in e for e in events))
        self.assertEqual(len(usage['repairs']),1)
        server.validate_plan(fixed,self.sources)

    def test_failed_repair_is_bounded_and_rejected(self):
        plan = valid_plan(); plan['concepts'][0]['quote'] = 'Not actually a source quote anywhere.'
        with patch('server.model_response', return_value={'response':json.dumps(plan['concepts'][0])}) as model:
            with self.assertRaisesRegex(ValueError,'still failed source verification'):
                server.repair_concepts(plan,self.sources,self.limits,None,{})
        self.assertEqual(model.call_count,1)

    def test_stream_reports_activity_and_keeps_complete_response(self):
        lines = [{'response':'hello ', 'done':False}, {'response':'world','done':True,'eval_count':2}]
        events = []
        with patch('server.urllib.request.urlopen',return_value=io.BytesIO(b''.join((json.dumps(x)+'\n').encode() for x in lines))):
            result = server.model_response({'model':server.MODEL},events.append)
        self.assertEqual(result['response'],'hello world')
        self.assertEqual(result['eval_count'],2)
        self.assertTrue(any('11 output characters' in e for e in events))

    def test_interrupted_model_stream_is_not_published(self):
        with patch('server.urllib.request.urlopen',return_value=io.BytesIO(b'{"response":"partial","done":false}\n')):
            with self.assertRaisesRegex(ValueError,'before completion'):
                server.model_response({},lambda _:None)

    def test_stream_endpoint_releases_lock_after_failure(self):
        handler = object.__new__(server.Handler)
        handler.wfile = io.BytesIO()
        handler.send_response = lambda _:None
        handler.send_header = lambda *_:None
        handler.end_headers = lambda:None
        with patch('server.generate',side_effect=ValueError('Verification failed')):
            handler.stream_generation(fixture_files())
        self.assertFalse(server.LOCK.locked())
        self.assertIn(b'"type": "error"',handler.wfile.getvalue())
        self.assertNotIn(b'"type": "result"',handler.wfile.getvalue())


if __name__ == '__main__': unittest.main()
