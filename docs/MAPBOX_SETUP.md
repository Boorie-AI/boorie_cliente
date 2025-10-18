# Mapbox Setup Guide for WNTR Map View

The WNTR Map View integrates water distribution networks with real-world geographic data using Mapbox and OpenStreetMap. This guide will help you set up Mapbox for the map visualization feature.

## Features

- **Geographic Network Visualization**: Display hydraulic networks on real-world maps
- **Multiple Base Maps**: Streets, Satellite, Outdoors, Light, and Dark themes
- **Network Overlay**: Visualize nodes (junctions, tanks, reservoirs) and links (pipes, pumps, valves)
- **Simulation Results**: Color-coded pressure and flow visualization
- **Interactive Elements**: Click on network elements for detailed information
- **Export to GeoJSON**: Export network data in geographic format

## Setup Instructions

### 1. Create a Mapbox Account

1. Visit [Mapbox](https://account.mapbox.com/auth/signup/)
2. Sign up for a free account
3. Verify your email address

### 2. Get Your Access Token

1. Log in to your [Mapbox account](https://account.mapbox.com/)
2. Navigate to your [Access Tokens page](https://account.mapbox.com/access-tokens/)
3. Copy your default public token or create a new one

### 3. Configure the Application

1. Create a `.env` file in the project root (if it doesn't exist):
   ```bash
   touch .env
   ```

2. Add your Mapbox token to the `.env` file:
   ```env
   VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   ```

3. (Optional) Configure default map center:
   ```env
   VITE_DEFAULT_MAP_LNG=-70.9
   VITE_DEFAULT_MAP_LAT=42.35
   VITE_DEFAULT_MAP_ZOOM=9
   ```

4. Restart your development server:
   ```bash
   npm run dev
   ```

## Usage

1. Navigate to the WNTR Network section in the application
2. Use the toggle button to switch between "Graph View" and "Map View"
3. Load an EPANET INP file
4. The network will be automatically overlaid on the map

## Map Controls

- **Pan**: Click and drag to move the map
- **Zoom**: Use mouse wheel or zoom controls
- **Rotate**: Right-click and drag to rotate
- **Network Toggle**: Use the layers button to show/hide the network overlay
- **Base Map**: Change map style in settings (Streets, Satellite, etc.)

## Coordinate Systems

The map view attempts to automatically position networks based on:
1. Geographic bounds if specified in the network data
2. Default center location if no bounds are available
3. Automatic scaling based on network size

For accurate geographic placement, ensure your EPANET model includes proper coordinate information.

## Troubleshooting

### Token Not Working
- Ensure there are no spaces in your token
- Check that the `.env` file is in the project root
- Verify the token starts with `pk.`

### Map Not Loading
- Check browser console for errors
- Ensure you have internet connectivity
- Try clearing browser cache

### Network Not Visible
- Click the layers button to ensure overlay is enabled
- Check that the INP file loaded successfully
- Adjust opacity in map settings

## Free Tier Limits

Mapbox's free tier includes:
- 50,000 map loads per month
- 200,000 tile requests per month
- 50,000 geocoding requests per month

This is typically sufficient for development and small-scale usage.

## Security Note

- Never commit your `.env` file to version control
- Add `.env` to your `.gitignore` file
- For production, use environment variables from your hosting provider