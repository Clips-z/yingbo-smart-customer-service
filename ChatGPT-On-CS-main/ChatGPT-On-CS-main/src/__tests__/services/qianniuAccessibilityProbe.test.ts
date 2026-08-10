import { classifyQianniuAccessibility } from '../../main/backend/services/qianniuAccessibilityProbe';

describe('classifyQianniuAccessibility', () => {
  it('only selects accessibility as primary when contact, messages and input are all available', () => {
    expect(
      classifyQianniuAccessibility({
        ok: true,
        capabilities: {
          can_resolve_active_contact: true,
          can_read_messages: true,
          can_locate_input: true,
          primary_eligible: true,
        },
      }).mode,
    ).toBe('uia-msaa-primary');
  });

  it('keeps partial accessibility as enrichment instead of pretending it can read chat', () => {
    expect(
      classifyQianniuAccessibility({
        ok: true,
        capabilities: {
          can_read_contact: true,
          can_resolve_active_contact: false,
          can_read_messages: false,
          can_locate_input: false,
          can_read_products: true,
          primary_eligible: false,
        },
      }).mode,
    ).toBe('accessibility-partial');
  });

  it('marks a missing client as unavailable', () => {
    expect(
      classifyQianniuAccessibility({ ok: false, error: 'not found' }).mode,
    ).toBe('unavailable');
  });
});

