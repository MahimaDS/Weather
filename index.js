const apiKey = "7586c5aaa748989f2e567cb4e2875585";
const searchBox = document.querySelector(".search-box input");
const searchBtn = document.querySelector(".search-btn");
const clearBtn = document.querySelector(".clear-btn");
const weatherIcon = document.querySelector(".weather-icon");

// Elements for current weather
const weatherContainer = document.querySelector(".weather-container");
const errorText = document.querySelector(".error");
const cityElement = document.querySelector(".city");
const tempElement = document.querySelector(".temp");
const humidityElement = document.querySelector(".humidity");
const windElement = document.querySelector(".wind");
const weatherDescElement = document.querySelector(".weather-desc");
const dateTimeElement = document.querySelector(".date-time");
const feelsLikeElement = document.querySelector(".feels-like");
const highestTempElement = document.querySelector(".highest-temp .value");
const lowestTempElement = document.querySelector(".lowest-temp .value");

// Elements for forecast
const hourlyContainer = document.querySelector(".hourly-container");
const dailyContainer = document.querySelector(".daily-container");

// Weather icon mapping
const weatherIcons = {
    "Clear": "clear.png",
    "Clouds": "clouds.png",
    "Rain": "rain.png",
    "Drizzle": "drizzle.png",
    "Mist": "mist.png",
    "Snow": "snow.png"
};

// Function to format date
function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Function to format time
function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Function to get day name
function getDayName(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// Function to get current weather
async function getCurrentWeather(city) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?units=metric&q=${city}&appid=${apiKey}`);
        
        if (response.status === 404) {
            errorText.innerHTML = "City not found. Please enter a valid city name.";
            errorText.style.display = "block";
            weatherContainer.style.display = "none";
            return null;
        }
        
        const data = await response.json();
        
        // Update current weather UI
        cityElement.innerHTML = data.name;
        tempElement.innerHTML = Math.round(data.main.temp) + "°C";
        humidityElement.innerHTML = data.main.humidity + "%";
        windElement.innerHTML = data.wind.speed + " km/h";
        feelsLikeElement.innerHTML = Math.round(data.main.feels_like) + "°C";
        weatherDescElement.innerHTML = data.weather[0].description;
        
        // Set initial values for high/low temperature (will be updated with more accurate data from forecast API)
        highestTempElement.innerHTML = Math.round(data.main.temp_max) + "°C";
        lowestTempElement.innerHTML = Math.round(data.main.temp_min) + "°C";
        
        // Update date and time
        const now = new Date();
        dateTimeElement.innerHTML = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + 
                                  now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        // Update weather icon
        const weatherMain = data.weather[0].main;
        weatherIcon.src = weatherIcons[weatherMain] || "clear.png";
        
        // Show weather container, hide error
        weatherContainer.style.display = "block";
        errorText.style.display = "none";
        
        return {
            lat: data.coord.lat,
            lon: data.coord.lon
        };
    } catch (error) {
        console.error("Error fetching current weather:", error);
        errorText.innerHTML = "An error occurred. Please try again.";
        errorText.style.display = "block";
        weatherContainer.style.display = "none";
        return null;
    }
}

// Function to get forecast data
async function getForecast(lat, lon) {
    try {
        // Clear previous daily forecast content
        dailyContainer.innerHTML = '<p class="loading-text">Loading forecast data...</p>';
        
        // First, get the OneCall data for current and hourly data
        const oneCallResponse = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely&appid=${apiKey}`);
        
        if (!oneCallResponse.ok) {
            throw new Error("Failed to fetch from OneCall API");
        }
        
        const oneCallData = await oneCallResponse.json();
        console.log("OneCall data:", oneCallData);
        
        // Update high/low temps for today using the OneCall daily data
        if (oneCallData.daily && oneCallData.daily.length > 0) {
            const today = oneCallData.daily[0];
            highestTempElement.innerHTML = Math.round(today.temp.max) + "°C";
            lowestTempElement.innerHTML = Math.round(today.temp.min) + "°C";
        }
        
        // Update current hourly forecast (24 hours)
        updateHourlyForecast(oneCallData.hourly.slice(0, 24));
        
        // Then get the 5-day forecast data
        const extendedResponse = await fetch(`https://api.openweathermap.org/data/2.5/forecast/daily?lat=${lat}&lon=${lon}&units=metric&cnt=5&appid=${apiKey}`);
        
        let fiveDayForecast;
        
        // If 16-day forecast API is unavailable (it's a paid feature), generate our own 5-day forecast from daily data
        if (!extendedResponse.ok) {
            console.log("5-day forecast unavailable, using 7-day forecast from OneCall");
            
            // Get 5 days from OnceCall API
            fiveDayForecast = oneCallData.daily.slice(0, 5);
        } else {
            const extendedData = await extendedResponse.json();
            console.log("Extended forecast data:", extendedData);
            fiveDayForecast = extendedData.list;
        }
        
        // Create full hourly data for all 5 days (combining real data with approximations)
        const fullHourlyData = generateFullHourlyData(oneCallData.hourly, fiveDayForecast);
        
        // Update daily forecast with all 5 days
        updateDailyForecast(fiveDayForecast, fullHourlyData);
    } catch (error) {
        console.error("Error fetching forecast:", error);
        
        // Try an alternative approach using the 5-day/3-hour forecast API
        try {
            dailyContainer.innerHTML = '<p class="loading-text">Trying alternative forecast source...</p>';
            
            // Fetch 5-day forecast data (3-hour intervals)
            const forecastResponse = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=40&appid=${apiKey}`);
            const forecastData = await forecastResponse.json();
            console.log("Alternative forecast data:", forecastData);
            
            // Process hourly data from 3-hour intervals
            const processedHourlyData = processHourlyForecast(forecastData);
            updateHourlyForecast(processedHourlyData.slice(0, 24));
            
            // Process daily data from the 5-day forecast
            const processedDailyData = processDailyForecast(forecastData);
            
            // Update high/low temps for today using the processed daily data
            if (processedDailyData && processedDailyData.length > 0) {
                const today = processedDailyData[0];
                highestTempElement.innerHTML = Math.round(today.temp.max) + "°C";
                lowestTempElement.innerHTML = Math.round(today.temp.min) + "°C";
            }
            
            // Generate hourly data for all 5 days
            const fullHourlyData = generateFullHourlyData(processedHourlyData, processedDailyData);
            
            // Update daily forecast with 5 days and hourly data
            updateDailyForecast(processedDailyData, fullHourlyData);
        } catch (fallbackError) {
            console.error("Error fetching alternative forecast:", fallbackError);
            dailyContainer.innerHTML = '<p class="error-text">Unable to load forecast data. Please try again later.</p>';
        }
    }
}

// Extend the available daily forecast to 5 days by generating additional days
function extendTo5Days(dailyData) {
    const result = [...dailyData];
    
    // If we already have 5 days, return as is
    if (result.length >= 5) {
        return result.slice(0, 5);
    }
    
    const lastDay = result[result.length - 1];
    const lastDayDate = new Date(lastDay.dt * 1000);
    
    // Add days until we have 5
    while (result.length < 5) {
        // Create next day
        const nextDayDate = new Date(lastDayDate);
        nextDayDate.setDate(lastDayDate.getDate() + (result.length - dailyData.length + 1));
        
        // Create a new forecast day based on patterns from existing days
        const newDay = {
            dt: Math.floor(nextDayDate.getTime() / 1000),
            temp: {
                day: lastDay.temp.day,
                min: lastDay.temp.min - 1 + (Math.random() * 2), // Slightly vary the temperature
                max: lastDay.temp.max - 1 + (Math.random() * 2)
            },
            weather: [...lastDay.weather] // Use same weather as last known day
        };
        
        result.push(newDay);
    }
    
    return result;
}

// Generate a full 5-day forecast from available daily data
function generateTenDayForecast(dailyData) {
    // First use the available daily data
    const result = [...dailyData];
    
    // If we already have 5 days, return as is
    if (result.length >= 5) {
        return result.slice(0, 5);
    }
    
    // Otherwise extend to 5 days
    return extendTo5Days(result);
}

// Generate hourly data for all 5 days (combining real API data with generated data)
function generateFullHourlyData(availableHourlyData, fiveDayForecast) {
    const fullHourlyData = [...availableHourlyData];
    
    // Create a map of daily forecasts by date string for easy lookup
    const dailyMap = new Map();
    fiveDayForecast.forEach(day => {
        const date = new Date(day.dt * 1000);
        const dateString = date.toDateString();
        dailyMap.set(dateString, day);
    });
    
    // Generate hourly data for all 5 days
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
        const currentDay = fiveDayForecast[dayIndex];
        if (!currentDay) continue;
        
        const dayDate = new Date(currentDay.dt * 1000);
        const dayStart = new Date(dayDate);
        dayStart.setHours(0, 0, 0, 0);
        
        // Check if we need to generate hours for this day
        const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
        const hoursForDay = fullHourlyData.filter(hour => {
            const hourDate = new Date(hour.dt * 1000);
            return hourDate.toDateString() === dayDate.toDateString();
        });
        
        // If this day has fewer than 24 hours of data, generate the missing hours
        if (hoursForDay.length < 24) {
            // Generate a realistic hourly temperature curve based on min/max
            const tempMin = currentDay.temp.min;
            const tempMax = currentDay.temp.max;
            const weatherMain = currentDay.weather[0].main;
            
            for (let hour = 0; hour < 24; hour++) {
                // Skip if we already have data for this hour
                const hourExists = hoursForDay.some(h => {
                    const hDate = new Date(h.dt * 1000);
                    return hDate.getHours() === hour;
                });
                
                if (!hourExists) {
                    // Create a typical temperature curve: coldest at 4-5am, warmest at 2-3pm
                    let tempFactor;
                    if (hour <= 5) {
                        tempFactor = 0.2; // Early morning (cold)
                    } else if (hour <= 10) {
                        tempFactor = 0.3 + (hour - 5) * 0.1; // Morning warming up
                    } else if (hour <= 15) {
                        tempFactor = 0.8 + (hour - 10) * 0.04; // Afternoon (warm)
                    } else {
                        tempFactor = 0.8 - (hour - 15) * 0.06; // Evening cooling down
                    }
                    
                    const hourTemp = tempMin + (tempMax - tempMin) * tempFactor;
                    
                    // Create the hour timestamp
                    const hourTime = new Date(dayStart);
                    hourTime.setHours(hour, 0, 0, 0);
                    const hourTimestamp = Math.floor(hourTime.getTime() / 1000);
                    
                    // Create weather condition based on day's weather
                    let hourWeather = currentDay.weather[0];
                    
                    // Add the generated hour
                    fullHourlyData.push({
                        dt: hourTimestamp,
                        temp: hourTemp,
                        weather: [hourWeather],
                        isApproximate: true // Mark as approximate
                    });
                }
            }
        }
    }
    
    // Sort the full hourly data by timestamp
    return fullHourlyData.sort((a, b) => a.dt - b.dt);
}

// Function to update hourly forecast
function updateHourlyForecast(hourlyData) {
    hourlyContainer.innerHTML = '';
    
    // Add swipe controls
    const prevBtn = document.createElement('button');
    prevBtn.classList.add('swipe-control', 'swipe-prev');
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    
    const nextBtn = document.createElement('button');
    nextBtn.classList.add('swipe-control', 'swipe-next');
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    
    hourlyContainer.appendChild(prevBtn);
    hourlyContainer.appendChild(nextBtn);
    
    // Create hour items
    hourlyData.forEach((hour, index) => {
        const weatherMain = hour.weather[0].main;
        const iconSrc = weatherIcons[weatherMain] || "clear.png";
        const time = index === 0 ? 'Now' : formatTime(hour.dt);
        
        const hourlyItem = document.createElement('div');
        hourlyItem.classList.add('hour-item');
        hourlyItem.innerHTML = `
            <span>${time}</span>
            <img src="${iconSrc}" alt="${hour.weather[0].description}">
            <span>${Math.round(hour.temp)}°C</span>
        `;
        
        hourlyContainer.appendChild(hourlyItem);
    });
    
    // Create swipe indicator dots
    const indicatorContainer = document.createElement('div');
    indicatorContainer.classList.add('swipe-indicator');
    
    // Calculate number of dots needed (based on visible items)
    const containerWidth = hourlyContainer.clientWidth;
    const itemWidth = 110 + 15; // width + gap
    const visibleItems = Math.floor(containerWidth / itemWidth);
    const totalDots = Math.ceil(hourlyData.length / visibleItems);
    
    // Create dots
    for (let i = 0; i < totalDots; i++) {
        const dot = document.createElement('div');
        dot.classList.add('swipe-dot');
        if (i === 0) dot.classList.add('active');
        indicatorContainer.appendChild(dot);
    }
    
    // Add indicator to parent element
    hourlyContainer.parentElement.appendChild(indicatorContainer);
    
    // Add event listeners for swipe controls
    prevBtn.addEventListener('click', () => {
        hourlyContainer.scrollBy({ left: -containerWidth, behavior: 'smooth' });
        updateActiveDot(-1);
    });
    
    nextBtn.addEventListener('click', () => {
        hourlyContainer.scrollBy({ left: containerWidth, behavior: 'smooth' });
        updateActiveDot(1);
    });
    
    // Add scroll event listener to update dots
    let currentDotIndex = 0;
    
    function updateActiveDot(direction) {
        const dots = indicatorContainer.querySelectorAll('.swipe-dot');
        if (dots.length <= 1) return;
        
        dots[currentDotIndex].classList.remove('active');
        
        if (direction > 0) {
            currentDotIndex = (currentDotIndex + 1) % totalDots;
        } else if (direction < 0) {
            currentDotIndex = (currentDotIndex - 1 + totalDots) % totalDots;
        }
        
        dots[currentDotIndex].classList.add('active');
    }
    
    hourlyContainer.addEventListener('scroll', () => {
        const scrollPosition = hourlyContainer.scrollLeft;
        const newDotIndex = Math.round(scrollPosition / containerWidth);
        
        if (newDotIndex !== currentDotIndex && newDotIndex < totalDots) {
            const dots = indicatorContainer.querySelectorAll('.swipe-dot');
            dots[currentDotIndex].classList.remove('active');
            dots[newDotIndex].classList.add('active');
            currentDotIndex = newDotIndex;
        }
    });
    
    // Enable touch swipe
    let touchStartX = 0;
    
    hourlyContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    hourlyContainer.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        
        if (Math.abs(diff) > 30) { // Minimum swipe distance
            if (diff > 0) {
                // Swipe right
                prevBtn.click();
            } else {
                // Swipe left
                nextBtn.click();
            }
        }
    }, { passive: true });
}

// Function to add swipe controls to a container
function addSwipeControls(container, itemsContainer) {
    // Add swipe controls
    const prevBtn = document.createElement('button');
    prevBtn.classList.add('swipe-control', 'swipe-prev');
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    
    const nextBtn = document.createElement('button');
    nextBtn.classList.add('swipe-control', 'swipe-next');
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    
    container.style.position = 'relative';
    container.appendChild(prevBtn);
    container.appendChild(nextBtn);
    
    // Calculate visible items
    const containerWidth = container.clientWidth;
    const itemWidth = 100 + 10; // width + gap
    
    // Add event listeners for swipe controls
    prevBtn.addEventListener('click', () => {
        itemsContainer.scrollBy({ left: -containerWidth, behavior: 'smooth' });
    });
    
    nextBtn.addEventListener('click', () => {
        itemsContainer.scrollBy({ left: containerWidth, behavior: 'smooth' });
    });
    
    // Enable touch swipe
    let touchStartX = 0;
    
    itemsContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    itemsContainer.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        
        if (Math.abs(diff) > 30) { // Minimum swipe distance
            if (diff > 0) {
                // Swipe right
                prevBtn.click();
            } else {
                // Swipe left
                nextBtn.click();
            }
        }
    }, { passive: true });
}

// Function to update daily forecast with dropdown for hourly data
function updateDailyForecast(dailyData, hourlyData) {
    dailyContainer.innerHTML = '';
    
    if (!dailyData || dailyData.length === 0) {
        dailyContainer.innerHTML = '<p class="error-text">No forecast data available</p>';
        return;
    }
    
    console.log("Daily data count:", dailyData.length);
    
    // Take only 5 days instead of 10
    const fiveDayData = dailyData.slice(0, 5);
    
    fiveDayData.forEach((day, index) => {
        if (!day) return; // Skip if day data is undefined
        
        const weatherMain = day.weather && day.weather[0] ? day.weather[0].main : "Clear";
        const iconSrc = weatherIcons[weatherMain] || "clear.png";
        const dayName = index === 0 ? 'Today' : getDayName(day.dt);
        const dayDate = formatDate(day.dt);
        
        // Handle different API response structures for temperature
        const maxTemp = day.temp && day.temp.max ? Math.round(day.temp.max) : 
                     (day.temp ? Math.round(day.temp) : "--");
        const minTemp = day.temp && day.temp.min ? Math.round(day.temp.min) : 
                     (day.temp ? Math.round(day.temp - 5) : "--");
        
        // Create day item container
        const dailyItem = document.createElement('div');
        dailyItem.classList.add('day-item-container');
        
        // Create the main day item
        const dayItemHTML = `
            <div class="day-item">
                <div class="day-header">
                    <span class="day-name">${dayName}</span>
                    <span class="day-date">${dayDate}</span>
                </div>
                <div class="day-details">
                    <img src="${iconSrc}" alt="${day.weather && day.weather[0] ? day.weather[0].description : 'Weather'}">
                    <div class="day-temp">
                        <span class="max-temp">${maxTemp}°</span>
                        <span class="min-temp">${minTemp}°</span>
                    </div>
                    <button class="dropdown-btn">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>
            <div class="hourly-dropdown">
                <div class="hourly-dropdown-content"></div>
            </div>
        `;
        
        dailyItem.innerHTML = dayItemHTML;
        
        // Get the hourly data for this day
        const hourlyForDay = getHourlyDataForDay(hourlyData, day.dt);
        
        // Add the hourly data to the dropdown content
        const dropdownContent = dailyItem.querySelector('.hourly-dropdown-content');
        const hourlyDropdown = dailyItem.querySelector('.hourly-dropdown');
        
        if (hourlyForDay.length === 0) {
            dropdownContent.innerHTML = '<p class="no-data">Generating hourly forecast...</p>';
            
            // Generate approximate hourly data based on daily min/max
            const generatedHours = generateHoursForDay(day);
            
            // Clear the "no data" message
            dropdownContent.innerHTML = '';
            
            // Add the generated hourly data
            generatedHours.forEach(hour => {
                const hourWeatherMain = hour.weather[0].main;
                const hourIconSrc = weatherIcons[hourWeatherMain] || "clear.png";
                
                const hourlyItemElement = document.createElement('div');
                hourlyItemElement.classList.add('dropdown-hour-item');
                hourlyItemElement.innerHTML = `
                    <span>${formatTime(hour.dt)}</span>
                    <img src="${hourIconSrc}" alt="${hour.weather[0].description}">
                    <span>${Math.round(hour.temp)}°C</span>
                `;
                
                if (hour.isApproximate) {
                    hourlyItemElement.classList.add('approximate');
                }
                
                dropdownContent.appendChild(hourlyItemElement);
            });
        } else {
            hourlyForDay.forEach(hour => {
                const hourWeatherMain = hour.weather && hour.weather[0] ? hour.weather[0].main : "Clear";
                const hourIconSrc = weatherIcons[hourWeatherMain] || "clear.png";
                
                const hourlyItemElement = document.createElement('div');
                hourlyItemElement.classList.add('dropdown-hour-item');
                hourlyItemElement.innerHTML = `
                    <span>${formatTime(hour.dt)}</span>
                    <img src="${hourIconSrc}" alt="${hour.weather && hour.weather[0] ? hour.weather[0].description : 'Weather'}">
                    <span>${Math.round(hour.temp)}°C</span>
                `;
                
                dropdownContent.appendChild(hourlyItemElement);
            });
        }
        
        // Add click event for dropdown toggle
        const dropdownBtn = dailyItem.querySelector('.dropdown-btn');
        
        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent row click from triggering
            hourlyDropdown.classList.toggle('open');
            dropdownBtn.querySelector('i').classList.toggle('fa-chevron-up');
            dropdownBtn.querySelector('i').classList.toggle('fa-chevron-down');
            
            // Add swipe controls when dropdown is opened
            if (hourlyDropdown.classList.contains('open') && !hourlyDropdown.getAttribute('swipe-added')) {
                addSwipeControls(hourlyDropdown, dropdownContent);
                hourlyDropdown.setAttribute('swipe-added', 'true');
            }
        });
        
        // Add click event to the day item to also toggle dropdown
        const dayItem = dailyItem.querySelector('.day-item');
        dayItem.addEventListener('click', () => {
            hourlyDropdown.classList.toggle('open');
            dropdownBtn.querySelector('i').classList.toggle('fa-chevron-up');
            dropdownBtn.querySelector('i').classList.toggle('fa-chevron-down');
            
            // Add swipe controls when dropdown is opened
            if (hourlyDropdown.classList.contains('open') && !hourlyDropdown.getAttribute('swipe-added')) {
                addSwipeControls(hourlyDropdown, dropdownContent);
                hourlyDropdown.setAttribute('swipe-added', 'true');
            }
        });
        
        dailyContainer.appendChild(dailyItem);
    });
}

// Generate approximate hourly data for a day based on min/max temperatures
function generateHoursForDay(day) {
    const result = [];
    
    // Get the day's timestamp
    const dayDate = new Date(day.dt * 1000);
    const dayStart = new Date(dayDate);
    dayStart.setHours(0, 0, 0, 0);
    
    // Min/Max temperatures
    const minTemp = day.temp && day.temp.min ? day.temp.min : (day.temp ? day.temp - 5 : 15);
    const maxTemp = day.temp && day.temp.max ? day.temp.max : (day.temp ? day.temp + 5 : 25);
    
    // Weather condition
    const weather = day.weather && day.weather[0] ? day.weather[0] : {
        main: "Clear",
        description: "clear sky"
    };
    
    // Generate all 24 hours
    for (let hour = 0; hour < 24; hour++) {
        // Create a typical temperature curve: coldest at 4-5am, warmest at 2-3pm
        let tempFactor;
        if (hour <= 5) {
            tempFactor = 0.2; // Early morning (cold)
        } else if (hour <= 10) {
            tempFactor = 0.3 + (hour - 5) * 0.1; // Morning warming up
        } else if (hour <= 15) {
            tempFactor = 0.8 + (hour - 10) * 0.04; // Afternoon (warm)
        } else {
            tempFactor = 0.8 - (hour - 15) * 0.06; // Evening cooling down
        }
        
        const hourTemp = minTemp + (maxTemp - minTemp) * tempFactor;
        
        // Create the hour timestamp
        const hourTime = new Date(dayStart);
        hourTime.setHours(hour, 0, 0, 0);
        const hourTimestamp = Math.floor(hourTime.getTime() / 1000);
        
        // Add the generated hour
        result.push({
            dt: hourTimestamp,
            temp: hourTemp,
            weather: [weather],
            isApproximate: true // Flag to indicate this is an approximation
        });
    }
    
    return result;
}

// Helper function to get hourly data for a specific day
function getHourlyDataForDay(hourlyData, dayTimestamp) {
    if (!hourlyData || hourlyData.length === 0) {
        return [];
    }
    
    const dayStart = new Date(dayTimestamp * 1000);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    
    const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
    const dayEndTimestamp = Math.floor(dayEnd.getTime() / 1000);
    
    // Filter hourly data for this day
    let hoursForDay = hourlyData.filter(hour => 
        hour.dt >= dayStartTimestamp && hour.dt <= dayEndTimestamp
    );
    
    // If we have less than 24 hours for this day, we might need to generate missing hours
    if (hoursForDay.length < 24 && hoursForDay.length > 0) {
        const result = [];
        const baseTime = new Date(dayStartTimestamp * 1000);
        
        // Create 24 hours for the day
        for (let i = 0; i < 24; i++) {
            const hourTime = new Date(baseTime);
            hourTime.setHours(i, 0, 0, 0);
            const hourTimestamp = Math.floor(hourTime.getTime() / 1000);
            
            // Find if we have data for this hour
            const existingHour = hoursForDay.find(h => {
                const hDate = new Date(h.dt * 1000);
                return hDate.getHours() === i;
            });
            
            if (existingHour) {
                result.push(existingHour);
            } else {
                // Create interpolated hour based on nearest hours
                const nearestHour = findNearestHour(hoursForDay, hourTimestamp);
                if (nearestHour) {
                    result.push({
                        dt: hourTimestamp,
                        temp: nearestHour.temp,
                        weather: nearestHour.weather
                    });
                }
            }
        }
        
        return result.sort((a, b) => a.dt - b.dt);
    }
    
    return hoursForDay.length > 0 ? hoursForDay.slice(0, 24) : [];
}

// Helper function to find the nearest hour data from existing data
function findNearestHour(hourlyData, targetTimestamp) {
    if (hourlyData.length === 0) {
        return null;
    }
    
    let nearest = hourlyData[0];
    let minDiff = Math.abs(nearest.dt - targetTimestamp);
    
    for (let i = 1; i < hourlyData.length; i++) {
        const diff = Math.abs(hourlyData[i].dt - targetTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = hourlyData[i];
        }
    }
    
    return nearest;
}

// Function to check weather
async function checkWeather(city) {
    const coords = await getCurrentWeather(city);
    if (coords) {
        await getForecast(coords.lat, coords.lon);
    }
}

// Event listener for search button
searchBtn.addEventListener("click", () => {
    checkWeather(searchBox.value);
});

// Event listener for clear button
clearBtn.addEventListener("click", () => {
    searchBox.value = "";
    clearBtn.classList.remove("visible");
});

// Show/hide clear button based on input
searchBox.addEventListener("input", () => {
    if (searchBox.value.length > 0) {
        clearBtn.classList.add("visible");
    } else {
        clearBtn.classList.remove("visible");
    }
});

// Event listener for Enter key with improved handling
searchBox.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // Prevent form submission if in a form
        checkWeather(searchBox.value);
    }
});

// Also keep the keyup event for better compatibility
searchBox.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
        checkWeather(searchBox.value);
    }
});

// Initial weather check for default city
window.addEventListener("load", () => {
    checkWeather("Delhi");
});

// Process 5-day/3-hour forecast into hourly data (24 hours)
function processHourlyForecast(forecastData) {
    const result = [];
    
    // Get the first 8 data points (covering 24 hours in 3-hour intervals)
    const threeHourData = forecastData.list.slice(0, 8);
    
    // For each 3-hour data point
    for (let i = 0; i < threeHourData.length; i++) {
        const current = threeHourData[i];
        
        // Add the current 3-hour data point
        result.push({
            dt: current.dt,
            temp: current.main.temp,
            weather: current.weather
        });
        
        // If not the last item, interpolate the next 2 hours
        if (i < threeHourData.length - 1) {
            const next = threeHourData[i + 1];
            
            // Calculate temperature difference for interpolation
            const tempDiff = (next.main.temp - current.main.temp) / 3;
            
            // Add interpolated data for the next 2 hours
            for (let hour = 1; hour <= 2; hour++) {
                const interpolatedTemp = current.main.temp + (tempDiff * hour);
                const interpolatedTime = current.dt + (hour * 3600); // Add hours in seconds
                
                result.push({
                    dt: interpolatedTime,
                    temp: interpolatedTemp,
                    // Use the weather from the closest 3-hour point
                    weather: hour === 1 ? current.weather : next.weather
                });
            }
        }
    }
    
    // Take exactly the first 24 hours
    return result.slice(0, 24);
}

// Process 5-day/3-hour forecast into daily data
function processDailyForecast(forecastData) {
    const dailyMap = new Map();
    
    // Group forecast data by day
    forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const day = date.toDateString();
        
        if (!dailyMap.has(day)) {
            dailyMap.set(day, {
                dt: item.dt,
                temps: [],
                temps_min: [],
                temps_max: [],
                weather: [],
                temp: { min: Infinity, max: -Infinity }
            });
        }
        
        const dayData = dailyMap.get(day);
        dayData.temps.push(item.main.temp);
        dayData.temps_min.push(item.main.temp_min);
        dayData.temps_max.push(item.main.temp_max);
        dayData.weather.push(item.weather[0]);
        dayData.temp.min = Math.min(dayData.temp.min, item.main.temp_min);
        dayData.temp.max = Math.max(dayData.temp.max, item.main.temp_max);
    });
    
    // Process the collected data for each day
    const result = Array.from(dailyMap.entries()).map(([dateString, data]) => {
        // Find the most frequent weather condition for the day
        const weatherFrequency = {};
        data.weather.forEach(w => {
            if (!weatherFrequency[w.main]) weatherFrequency[w.main] = 0;
            weatherFrequency[w.main]++;
        });
        
        let mostFrequentWeather = data.weather[0];
        let maxFreq = 0;
        
        Object.keys(weatherFrequency).forEach(weather => {
            if (weatherFrequency[weather] > maxFreq) {
                maxFreq = weatherFrequency[weather];
                mostFrequentWeather = data.weather.find(w => w.main === weather);
            }
        });
        
        return {
            dt: data.dt,
            temp: {
                day: data.temps.reduce((sum, temp) => sum + temp, 0) / data.temps.length,
                min: data.temp.min,
                max: data.temp.max
            },
            weather: [mostFrequentWeather]
        };
    });
    
    // Convert map to array and sort by date
    return result.sort((a, b) => a.dt - b.dt);
}