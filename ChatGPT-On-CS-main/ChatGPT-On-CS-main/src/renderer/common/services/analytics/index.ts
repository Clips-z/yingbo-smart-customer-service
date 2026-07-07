interface EventData {
  [key: string]: string | number | undefined;
}

export function sendEvent(
  eventName: string,
  title: string,
  eventData: EventData = {},
): void {
  void eventName;
  void title;
  void eventData;
}

export function trackButtonClick(buttonName: string): void {
  void buttonName;
}

export function trackCheckboxChange(
  checkboxName: string,
  value: string[],
): void {
  void checkboxName;
  void value;
}

export function trackPageView(pageName: string): void {
  void pageName;
}
