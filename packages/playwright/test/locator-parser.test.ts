import { describe, it, expect } from 'vitest';
import { LocatorParser } from '../src/locators/LocatorParser';

describe('LocatorParser', () => {
  it('should parse YAML content into structured locator items', () => {
    const yamlContent = `
username_input:
  type: label
  value: "Kullanıcı Adı"

login_btn:
  type: role
  role: button
  name: "Giriş Yap"

cart_icon:
  web:
    type: testid
    value: "nav-cart"
  mobile:
    type: label
    value: "Cart"
`;

    const items = LocatorParser.parseContent('login', yamlContent);
    expect(items).toHaveLength(3);

    expect(items[0].fullKey).toBe('login.username_input');
    expect((items[0].definition as any).type).toBe('label');
    expect((items[0].definition as any).value).toBe('Kullanıcı Adı');

    expect(items[1].fullKey).toBe('login.login_btn');
    expect((items[1].definition as any).role).toBe('button');
    expect((items[1].definition as any).name).toBe('Giriş Yap');

    expect(items[2].fullKey).toBe('login.cart_icon');
    expect((items[2].definition as any).web.type).toBe('testid');
    expect((items[2].definition as any).mobile.type).toBe('label');
  });

  it('should parse shorthand CSS string locators', () => {
    const yamlContent = `
submit_btn: "#submit-form-btn"
`;
    const items = LocatorParser.parseContent('checkout', yamlContent);
    expect(items).toHaveLength(1);
    expect(items[0].fullKey).toBe('checkout.submit_btn');
    expect((items[0].definition as any).type).toBe('css');
    expect((items[0].definition as any).value).toBe('#submit-form-btn');
  });
});
