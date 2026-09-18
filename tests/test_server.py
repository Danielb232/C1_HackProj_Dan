import base64
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch
import server

FIXTURES = Path(__file__).parent / 'fixtures'

def file(name, text):
    return {'name': name, 'data': base64.b64encode(text.encode()).decode()}

def fixture_files():
    return {kind: file(kind+'.txt', (FIXTURES / (name+'.txt')).read_text()) for kind, name in [('syllabus','syllabus'),('reading','reading')]}

def valid_plan():
    concept = {'title':'Population', 'summary':'The group of interest.', 'source_id':'R1',
        'quote':'A population is the entire group a researcher wants to understand.',
        'question':'What is the population?', 'answers':['Entire group','Subset','Treatment','Assignment'],
        'correct':0, 'explanation':'A population includes the entire group.'}
    return {'title':'Research', 'alignment':'Research methods', 'syllabus_id':'S1',
        'concepts':[copy.deepcopy(concept) for _ in range(3)],
        'relationships':[{'from':0,'to':1,'label':'relates to'},{'from':1,'to':2,'label':'informs'}],
        'review':{'big_picture':'Research design.', 'critical_question':'What can be inferred?', 'limitation':'Not all claims establish causality.'}}

class ExtractionTests(unittest.TestCase):
    def test_sources_and_stable_identity(self):
        a = server.prepare(fixture_files())
        self.assertEqual(a, server.prepare(fixture_files()))
        self.assertTrue(a['sources']['reading']['chunks'][0]['id'].startswith('R'))
        b = fixture_files(); b['reading'] = file('other.txt','A different source reading with enough text to support a meaningful extraction test.')
        self.assertNotEqual(a['id'],server.prepare(b)['id'])

    def test_oversize_text_is_not_truncated(self):
        with self.assertRaisesRegex(ValueError,'Nothing was silently truncated'):
            server.extract_file(file('large.txt','word '*2000),'S',6000)

    def test_empty_and_unsupported(self):
        for item in [file('empty.txt',''),file('image.png','x'*100),file('short.txt','short'),file('fake.pdf','not a pdf'*20)]:
            with self.assertRaises(ValueError): server.extract_file(item,'S',6000)

    def test_invalid_range(self):
        item=file('source.pdf','%PDF-'+'x'*100);item.update(start=5,end=2)
        with self.assertRaisesRegex(ValueError,'page range'):server.extract_file(item,'R',16000)

    def test_pdf_page_numbering_and_scans(self):
        item=file('source.pdf','%PDF-'+'x'*100);item.update(start=4,end=5)
        output=('First selected page has enough sample words to exceed the minimum text threshold.\fSecond selected page has text.\f').encode()
        with patch('server.subprocess.run') as run:
            run.return_value.returncode=0;run.return_value.stdout=output
            doc=server.extract_file(item,'R',16000)
            self.assertEqual([4,5],[c['page'] for c in doc['chunks']])
            run.return_value.stdout=b'\f'
            with self.assertRaisesRegex(ValueError,'OCR'):server.extract_file(item,'R',16000)

class ValidationTests(unittest.TestCase):
    def setUp(self): self.sources=server.prepare(fixture_files())['sources']
    def test_valid(self): self.assertEqual(server.validate_plan(valid_plan(),self.sources)['title'],'Research')
    def test_bad_citation(self):
        p=valid_plan();p['concepts'][0]['source_id']='R99'
        with self.assertRaisesRegex(ValueError,'quote'):server.validate_plan(p,self.sources)
    def test_invented_quote(self):
        p=valid_plan();p['concepts'][0]['quote']='This quote is not in the source.'
        with self.assertRaisesRegex(ValueError,'quote'):server.validate_plan(p,self.sources)
    def test_bad_answer_index(self):
        p=valid_plan();p['concepts'][0]['correct']=9
        with self.assertRaises(ValueError):server.validate_plan(p,self.sources)
    def test_duplicate_answers(self):
        p=valid_plan();p['concepts'][0]['answers'][1]='Entire group'
        with self.assertRaisesRegex(ValueError,'repeated'):server.validate_plan(p,self.sources)
    def test_missing_fields(self):
        p=valid_plan();del p['review']
        with self.assertRaises(ValueError):server.validate_plan(p,self.sources)
    def test_generation_only_constrains_reference_fields(self):
        with patch('server.ollama',return_value={'response':json.dumps(valid_plan())}) as request:
            server.generate(self.sources)
            schema=request.call_args.args[1]['format']['properties']
            self.assertEqual(schema['syllabus_id']['enum'],['S1'])
            self.assertNotIn('enum',schema['title'])
            concept=schema['concepts']['items']['properties']
            self.assertEqual(concept['source_id']['enum'],['R1'])
            self.assertNotIn('enum',concept['quote'])
            self.assertNotIn('enum',server.SCHEMA['properties']['syllabus_id'])

if __name__ == '__main__': unittest.main()
