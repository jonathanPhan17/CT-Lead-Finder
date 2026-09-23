import { describe, expect, it } from 'vitest';
import type { Recipient } from '../search/resultsView';
import { applyVariables, greetingName, isGenericContactName } from './personalize';

describe('greetingName', () => {
  it.each([
    [null, 'there'],
    ['', 'there'],
    ['Jane Doe', 'Jane'],
    ['Jane Doe, MD, PhD', 'Jane'],
    ['Dr. Jane Doe', 'Jane'],
    ['Prof Alan Turing', 'Alan'],
    ['JOHN SMITHSON', 'John'],
    ['J. Smith', 'there'],
    ['Clinical Trials Office', 'there'],
    ['Research Coordinator', 'there'],
    ['KP OCT', 'there'],
    ['Site 0042', 'there'],
    ['María José García', 'María'],
  ])('%j -> %s', (input, expected) => {
    expect(greetingName(input)).toBe(expected);
  });
});

describe('isGenericContactName', () => {
  it('does not flag ordinary names', () => {
    expect(isGenericContactName('Priya Raman')).toBe(false);
    expect(isGenericContactName("Sean O'Brien")).toBe(false);
  });
});

describe('applyVariables', () => {
  const recipient: Recipient = {
    email: 'jane@x.org',
    name: 'Dr. Jane Doe',
    isPI: true,
    trials: [
      {
        nctId: 'NCT01234567',
        title: 'A Study of Drug X',
        phase: 'Phase 2',
        studyStatus: 'RECRUITING',
        siteStatus: 'RECRUITING',
        sponsor: 'Acme',
        conditions: ['Melanoma', 'Skin Cancer'],
        facility: 'MGH',
        city: 'Boston',
      },
    ],
  };

  it('fills every known variable', () => {
    expect(
      applyVariables('Hi {{firstName}} ({{fullName}}): {{trialTitle}} / {{condition}} / {{facility}} / {{nctId}} / {{phase}}', recipient),
    ).toBe('Hi Jane (Dr. Jane Doe): A Study of Drug X / Melanoma / MGH / NCT01234567 / Phase 2');
  });

  it('leaves unknown and prototype-named variables untouched', () => {
    expect(applyVariables('{{bogus}} {{constructor}} {{toString}}', recipient)).toBe('{{bogus}} {{constructor}} {{toString}}');
  });

  it('degrades cleanly for a nameless inbox with no trials', () => {
    const inbox: Recipient = { email: 'trials@x.org', name: 'Clinical Trials Office', isPI: false, trials: [] };
    expect(applyVariables('Hi {{firstName}}, re {{nctId}}.{{fullName}}', inbox)).toBe('Hi there, re .');
  });
});
