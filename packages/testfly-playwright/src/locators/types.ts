export type LocatorType =
  | 'role'
  | 'label'
  | 'text'
  | 'testid'
  | 'placeholder'
  | 'alt'
  | 'title'
  | 'css'
  | 'xpath'
  | 'type';

declare global {
  namespace TestFly {
    export type LocatorPath = string;
  }
}

export type TypedLocatorKey = TestFly.LocatorPath | (string & {});


export interface SingleLocatorDef {
  type?: LocatorType;
  value?: string;
  role?: string;
  name?: string;
  exact?: boolean;
}

export interface PlatformLocatorDef {
  web?: SingleLocatorDef;
  ios?: SingleLocatorDef;
  android?: SingleLocatorDef;
  mobile?: SingleLocatorDef;
}

export type LocatorDef = SingleLocatorDef | PlatformLocatorDef;

export interface ParsedLocatorItem {
  page: string;
  name: string;
  fullKey: string; // e.g. "login.username_input"
  definition: LocatorDef;
}
