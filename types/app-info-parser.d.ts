declare module "app-info-parser" {
  export interface ParsedManifest {
    package?: string;
    versionName?: string;
    versionCode?: string | number;
    appName?: string | Record<string, string>;
    application?: {
      label?: string | Record<string, string>;
      [key: string]: unknown;
    };
    icon?: string;
    usesSdk?: {
      minSdkVersion?: string | number;
      targetSdkVersion?: string | number;
    };
    permissions?: string[];
    usesPermissions?: Array<{ name?: string }>;
    [key: string]: unknown;
  }

  /**
   * The package's default export is the constructor itself:
   *   const AppInfoParser = require("app-info-parser");
   *
   * In Node it requires a *file path* string (the extension decides
   * apk vs ipa); in browsers it accepts a File/Blob.
   */
  export default class AppInfoParser {
    constructor(file: string | Blob | File);
    parse(): Promise<ParsedManifest>;
  }
}
