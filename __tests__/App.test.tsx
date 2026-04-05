import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import App from '../App';
import {
  APP_HEADLINE,
  APP_NAME,
  HYGIENE_ITEMS,
  STACK_ITEMS,
} from '../src/content';

function collectText(node: ReactTestRenderer.ReactTestInstance): string[] {
  return node
    .findAllByType(Text)
    .flatMap(textNode => textNode.props.children)
    .flatMap((child: unknown) => {
      if (typeof child === 'string') {
        return [child];
      }

      if (Array.isArray(child)) {
        return child.filter((item): item is string => typeof item === 'string');
      }

      return [];
    });
}

describe('App', () => {
  it('renders headline and repository hygiene content', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<App />);
    });

    const texts = collectText(renderer.root).join('\n');

    expect(texts).toContain(APP_NAME);
    expect(texts).toContain(APP_HEADLINE);
    HYGIENE_ITEMS.forEach(item => expect(texts).toContain(item));
    STACK_ITEMS.forEach(item => expect(texts).toContain(item));
  });
});
