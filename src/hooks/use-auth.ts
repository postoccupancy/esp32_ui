import { useContext } from 'react';
import type { AuthContextType as JwtAuthContextType } from '../contexts/auth/jwt-context';
import { AuthContext } from '../contexts/auth/jwt-context';
import type { AuthContextType as AmplifyAuthContextType } from '../contexts/auth/amplify-context';
import type { AuthContextType as Auth0AuthContextType } from '../contexts/auth/auth0-context';
import type { AuthContextType as FirebaseAuthContextType } from '../contexts/auth/firebase-context';

type AuthContextType =
  | AmplifyAuthContextType
  | Auth0AuthContextType
  | FirebaseAuthContextType
  | JwtAuthContextType;

export const useAuth = <T = AuthContextType>() => useContext(AuthContext) as T;
