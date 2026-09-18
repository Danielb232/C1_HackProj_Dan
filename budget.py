"""Model-aware context budgeting. No source text or telemetry is written to disk."""
import math
import os
import threading

# Runtime/output allocation are explicit policy, not measured hardware capacity.
CONTEXT_REQUEST = int(os.environ.get('ECHO_CONTEXT_TOKENS', '12288'))
OUTPUT_TOKENS = 2100
TEMPLATE_RESERVE = 256
SAFETY_FRACTION = 0.20
_lock = threading.Lock()
_observed_ratio = 0.0
_samples = 0


def baseline(text):
    # ASCII prose starts at ~3 bytes/token; non-ASCII bytes are counted
    # individually rather than assuming English token density for every language.
    ascii_bytes = sum(ord(c) < 128 for c in text)
    return max(1, math.ceil(ascii_bytes / 3 + len(text.encode('utf-8')) - ascii_bytes))


def inspect(prompt, model_info):
    arch = model_info.get('general.architecture')
    maximum = model_info.get(f'{arch}.context_length')
    if type(maximum) is not int or maximum <= 0:
        raise ValueError('Model context capacity is unavailable. Check Ollama and preview again.')
    if CONTEXT_REQUEST <= 0:
        raise ValueError('ECHO_CONTEXT_TOKENS must be a positive integer.')
    context = min(CONTEXT_REQUEST, maximum)
    with _lock:
        factor, samples = max(1.0, _observed_ratio), _samples
    estimated = math.ceil(baseline(prompt) * factor)
    safety = math.ceil(context * SAFETY_FRACTION)
    available = max(0, context - OUTPUT_TOKENS - TEMPLATE_RESERVE - safety)
    return {'model_max': maximum, 'context': context, 'output_reserve': OUTPUT_TOKENS,
            'template_reserve': TEMPLATE_RESERVE, 'safety_reserve': safety,
            'prompt_estimate': estimated, 'prompt_budget': available,
            'remaining': available - estimated, 'fits': estimated <= available,
            'calibration_samples': samples, 'estimate_factor': factor}


def observe(prompt, actual_tokens):
    """Only raises the conservative baseline; short/easy inputs cannot relax it."""
    global _observed_ratio, _samples
    if type(actual_tokens) is int and actual_tokens > 0:
        with _lock:
            _observed_ratio = max(_observed_ratio, actual_tokens / baseline(prompt))
            _samples += 1
