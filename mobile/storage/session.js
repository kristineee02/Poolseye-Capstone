import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'poolseye-lifeguard-token';
const USER_KEY = 'poolseye-lifeguard-session';

export async function readSessionToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveSession(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

export async function saveSessionUser(user) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}
