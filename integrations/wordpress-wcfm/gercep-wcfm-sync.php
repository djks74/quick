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
add_filter('wcfm_vendor_menus', 'gercep_wcfm_menus', 999);

function gercep_wcfm_menus($menus) {
    // Try to get the robust WCFM endpoint URL
    $link = admin_url('admin.php?page=wcfm-settings'); // Fallback
    if (function_exists('get_wcfm_url')) {
        $link = get_wcfm_url() . 'settings/';
    }

    $menus['gercep_ai_sync'] = [
        'label'    => 'Gercep AI',
        'link'     => $link, 
        'icon'     => 'rocket',
        'priority' => 1
    ];
    return $menus;
}

// 2. Add Gercep Settings to WCFM Vendor Dashboard (Directly in General Settings for maximum visibility)
add_filter('wcfm_marketplace_settings_fields_general', function($settings_fields, $vendor_id) {
    $gercep_api_key = get_user_meta($vendor_id, 'gercep_api_key', true);
    
    // Add a divider/heading
    $settings_fields['gercep_ai_header'] = [
        'label'       => __('Gercep AI Configuration', 'wc-frontend-manager'),
        'type'        => 'html',
        'value'       => '<h2 style="margin-top:20px; border-bottom:1px solid #eee; padding-bottom:10px;">Gercep AI Assistant</h2>',
        'class'       => 'wcfm-text wcfm_ele',
        'label_class' => 'wcfm_title'
    ];

    $settings_fields['gercep_api_key'] = [
        'label'       => __('Gercep API Key', 'wc-frontend-manager'),
        'type'        => 'text',
        'class'       => 'wcfm-text wcfm_ele',
        'label_class' => 'wcfm_title',
        'value'       => $gercep_api_key,
        'placeholder' => 'Enter your Sovereign API Key',
        'desc'        => __('Get your API key from Gercep Dashboard > Integrations.', 'wc-frontend-manager')
    ];
    
    return $settings_fields;
}, 50, 2);

// 3. Remove the dedicated tab as it might be blocked by theme/WCFM config
// (Cleaned up redundant code)

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
