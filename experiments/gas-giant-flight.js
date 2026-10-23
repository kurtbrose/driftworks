import * as weather from './gas-giant-weather.js';
window.Driftworks.gasGiantWeather=weather;
window.dispatchEvent(new Event('gas-weather-ready'));
