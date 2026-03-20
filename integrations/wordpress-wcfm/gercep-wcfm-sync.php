<?php
/**
 * Plugin Name: Gercep WCFM Sync
 * Description: Automatically syncs WCFM Vendor products to Gercep Platform via AI-ready API.
 * Version: 1.0.0
 * Author: Gercep Platform
 */

if (!defined('ABSPATH')) exit;

/**
 * Debug helper
 */
function gercep_log($message) {
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('Gercep AI: ' . $message);
    }
}

// 1. Add Gercep AI Menu to WCFM Sidebar
add_filter('wcfm_menus', 'gercep_wcfm_menus', 999);
add_filter('wcfm_vendor_menus', 'gercep_wcfm_menus', 999); // Specifically for vendors

function gercep_wcfm_menus($menus) {
    $base_url = function_exists('get_wcfm_url') ? get_wcfm_url() : admin_url('admin.php?page=wcfm-settings');
    $menus['gercep_ai_sync'] = [
        'label'    => 'Gercep AI Assistant',
        'link'     => $base_url . 'settings/?tab=gercep_ai_settings', 
        'icon'     => 'wcfmfa fa-rocket', 
        'priority' => 1
    ];
    return $menus;
}

// 2. Add a dedicated "Gercep AI" Tab in Settings
add_filter('wcfm_marketplace_settings_menus', function($menus) {
    $menus['gercep_ai_settings'] = [
        'label'    => 'Gercep AI',
        'icon'     => 'rocket',
        'priority' => 5 // Higher priority to show it earlier
    ];
    return $menus;
}, 999);

// 3. Add to General Settings as fallback
add_filter('wcfm_marketplace_settings_fields_general', function($settings_fields, $vendor_id) {
    $gercep_api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    
    $settings_fields['gercep_api_key'] = [
        'label'       => __('Gercep API Key', 'wc-frontend-manager'),
        'type'        => 'text',
        'class'       => 'wcfm-text wcfm_ele',
        'label_class' => 'wcfm_title',
        'value'       => $gercep_api_key,
        'desc'        => __('Get your API key from Gercep Dashboard > Integrations.', 'wc-frontend-manager')
    ];
    
    return $settings_fields;
}, 10, 2);

// 4. Content for the Gercep AI Settings Tab
add_action('wcfm_marketplace_settings_fields_gercep_ai_settings', function($vendor_id) {
    $gercep_api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    ?>
    <div class="wcfm-container">
        <div id="wcfm_settings_form_gercep_ai_expander" class="wcfm-content">
            <h2>Gercep AI Assistant Configuration</h2>
            <div class="wcfm_clearfix"></div>
            <div class="wcfm_ele wcfm_title">Gercep API Key</div>
            <input type="text" name="gercep_api_key" class="wcfm-text" value="<?php echo esc_attr($gercep_api_key); ?>" placeholder="Enter your Sovereign API Key" />
            <p class="description">Get your API key from the Gercep Dashboard under <strong>Integrations</strong>.</p>
        </div>
    </div>
    <?php
});

// 4. Save Gercep Settings
add_action('wcfm_vendor_settings_update', function($vendor_id, $wcfm_settings_form) {
    if (isset($wcfm_settings_form['gercep_api_key'])) {
        update_user_meta($vendor_id, 'gercep_api_key', sanitize_text_field($wcfm_settings_form['gercep_api_key']));
    }
}, 10, 2);

/**
 * Helper to send data to Gercep
 */
function gercep_sync_to_api($api_key, $payload) {
    $url = 'https://gercep.click/api/partner/sync-products';
    
    $response = wp_remote_post($url, [
        'headers' => [
            'Content-Type' => 'application/json',
            'x-api-key'    => $api_key
        ],
        'body'    => json_encode($payload),
        'timeout' => 30,
    ]);

    if (is_wp_error($response)) {
        error_log('Gercep Sync Error: ' . $response->get_error_message());
        return false;
    }

    return true;
}

// 5. Hook: Sync on Product Save/Update
add_action('wcfm_after_product_save', 'gercep_wcfm_sync_product', 10, 2);
function gercep_wcfm_sync_product($product_id, $wcfm_data) {
    $vendor_id = wcfm_get_vendor_id_by_post($product_id);
    if (!$vendor_id) return;

    $api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    if (empty($api_key)) return;

    $product = wc_get_product($product_id);
    if (!$product) return;

    // Get Flattened Category
    $categories = wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']);
    $category = !empty($categories) ? end($categories) : 'General';

    $payload = [
        'action'   => 'upsert',
        'products' => [[
            'externalId'  => (string)$product_id,
            'name'        => $product->get_name(),
            'price'       => (float)$product->get_price(),
            'category'    => $category,
            'description' => wp_strip_all_tags($product->get_short_description() ?: $product->get_description()),
            'stock'       => $product->get_stock_quantity() !== null ? (int)$product->get_stock_quantity() : 999999,
            'image'       => wp_get_attachment_url($product->get_image_id()) ?: null
        ]]
    ];

    gercep_sync_to_api($api_key, $payload);
}

// 4. Hook: Sync on Product Delete
add_action('before_delete_post', function($post_id) {
    if (get_post_type($post_id) !== 'product') return;

    $vendor_id = wcfm_get_vendor_id_by_post($post_id);
    if (!$vendor_id) return;

    $api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    if (empty($api_key)) return;

    $payload = [
        'action'   => 'delete',
        'products' => [[
            'externalId' => (string)$post_id
        ]]
    ];

    gercep_sync_to_api($api_key, $payload);
}, 10);
