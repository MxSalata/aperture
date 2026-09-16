import { notifications } from '@mantine/notifications';
import { describeError } from './errors';

export function notifySuccess(message: string, title = 'Done') {
  notifications.show({ title, message, color: 'teal', autoClose: 4000 });
}

export function notifyInfo(message: string, title?: string) {
  notifications.show({ title, message, color: 'blue', autoClose: 5000 });
}

export function notifyError(error: unknown, title = 'Request failed') {
  notifications.show({ title, message: describeError(error), color: 'red', autoClose: 8000 });
}
