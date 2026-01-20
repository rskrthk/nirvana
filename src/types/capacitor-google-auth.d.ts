// declare module '@codetrix-studio/capacitor-google-auth' {
//   export interface GoogleAuthOptions {
//     clientId?: string;
//     scopes?: string[];
//     grantOfflineAccess?: boolean;
//     forceCodeForRefreshToken?: boolean;
//   }

//   export interface GoogleUser {
//     id: string;
//     email: string;
//     name: string;
//     imageUrl?: string;
//     authentication: {
//       accessToken?: string;
//       idToken?: string;
//     };
//   }

//   export const GoogleAuth: {
//     initialize(options: GoogleAuthOptions): void;
//     signIn(): Promise<GoogleUser>;
//     signOut(): Promise<void>;
//     refresh(): Promise<GoogleUser>;
//   };
// }


// declare module '@codetrix-studio/capacitor-google-auth' {
//   export const GoogleAuth: any;
// }
