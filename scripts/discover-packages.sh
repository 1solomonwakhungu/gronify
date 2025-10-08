#!/bin/bash

# Test script to verify package discovery logic
# This mimics what the GitHub Action will do

echo "🔍 Discovering packages in src folder with package-lock.json..."

# Find all directories in src that contain package-lock.json
if [ -d "src" ]; then
    packages=$(find src -name "package-lock.json" -type f | xargs dirname 2>/dev/null)
    
    if [ -n "$packages" ]; then
        echo "📦 Found the following packages:"
        echo "$packages" | while read -r package; do
            echo "  - $package"
            
            # Check if package.json exists
            if [ -f "$package/package.json" ]; then
                name=$(grep '"name"' "$package/package.json" | sed 's/.*"name": *"\([^"]*\)".*/\1/')
                version=$(grep '"version"' "$package/package.json" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
                echo "    Name: $name"
                echo "    Version: $version"
            fi
            echo ""
        done
        
        # Convert to JSON array format (like GitHub Actions will use)
        packages_json=$(echo "$packages" | jq -R -s -c 'split("\n")[:-1]')
        echo "📋 JSON format for GitHub Actions:"
        echo "$packages_json"
    else
        echo "❌ No packages found with package-lock.json in src folder"
    fi
else
    echo "❌ src folder not found"
fi