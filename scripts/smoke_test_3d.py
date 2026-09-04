from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    
    # Capture console logs
    console_logs = []
    page.on('console', lambda msg: console_logs.append(f'{msg.type}: {msg.text}'))
    
    # Navigate to the designer page
    page.goto('http://localhost:5173/#/farms/1/map')
    page.wait_for_load_state('networkidle')
    
    # Wait for the page to fully render
    time.sleep(2)
    
    # Screenshot 1: Blueprint view initial load
    page.screenshot(path='/tmp/ff-blueprint-initial.png', full_page=False)
    
    # Check for the toggle button
    world_btn = page.locator('button:has-text("World")')
    blueprint_btn = page.locator('button:has-text("Blueprint")')
    
    print(f'Blueprint button visible: {blueprint_btn.is_visible()}')
    print(f'World button visible: {world_btn.is_visible()}')
    
    # Click World toggle
    if world_btn.is_visible():
        world_btn.click()
        time.sleep(3)  # Wait for 3D to load
        
        # Screenshot 2: World view
        page.screenshot(path='/tmp/ff-world-view.png', full_page=False)
        
        # Check for canvas in World view
        canvas_count = page.locator('canvas').count()
        print(f'Canvas count in World view: {canvas_count}')
    
    # Check console for errors
    errors = [log for log in console_logs if log.startswith('error:')]
    warnings = [log for log in console_logs if log.startswith('warning:')]
    
    print(f'Console errors: {len(errors)}')
    for e in errors[:10]:
        print(f'  {e}')
    print(f'Console warnings: {len(warnings)}')
    for w in warnings[:10]:
        print(f'  {w}')
    
    # Check network for three.js chunk BEFORE toggle (should be 0)
    # We can't easily check this after the fact, but we can verify the lazy load works
    # by checking if the page loaded without three.js initially
    
    browser.close()
    print('Smoke test complete.')
