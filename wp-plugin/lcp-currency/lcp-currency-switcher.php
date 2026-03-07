<?php
/**
 * Plugin Name: LCP Currency Switcher (USD/IDR)
 * Plugin URI: https://autoparts.mythoz.com/
 * Description: Automatically switches currency between USD and IDR based on user's IP address (Indonesia = IDR, others = USD). Supports real-time exchange rate fetching.
 * Version: 1.2.0
 * Author: LCP Auto Cars
 * Author URI: https://autoparts.mythoz.com/
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly.
}

class LCP_Currency_Switcher {

    private $exchange_rate;
    private $user_country = '';

    public function __construct() {
        // Run detection on init
        add_action( 'init', array( $this, 'init_plugin' ) );

        // Admin menu
        add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );

        // Filter WooCommerce currency
        add_filter( 'woocommerce_currency', array( $this, 'set_currency' ) );

        // Product Price Conversions
        $price_hooks = array(
            'woocommerce_product_get_price',
            'woocommerce_product_get_regular_price',
            'woocommerce_product_get_sale_price',
            'woocommerce_product_variation_get_price',
            'woocommerce_product_variation_get_regular_price',
            'woocommerce_product_variation_get_sale_price',
            'woocommerce_variation_prices_price',
            'woocommerce_variation_prices_regular_price',
            'woocommerce_variation_prices_sale_price',
        );

        foreach ( $price_hooks as $hook ) {
            add_filter( $hook, array( $this, 'convert_price' ), 10, 2 );
        }

        // Cart and Shipping
        add_filter( 'woocommerce_package_rates', array( $this, 'convert_shipping' ), 10, 2 );
        add_filter( 'woocommerce_currency_symbol', array( $this, 'set_currency_symbol' ), 10, 2 );
    }

    public function init_plugin() {
        $this->exchange_rate = $this->get_current_exchange_rate();
        $this->detect_user_country();
    }

    /**
     * Get exchange rate based on settings (Manual or Real-time)
     */
    private function get_current_exchange_rate() {
        $mode = get_option( 'lcp_rate_mode', 'manual' );
        
        if ( $mode === 'automatic' ) {
            $cached_rate = get_transient( 'lcp_realtime_rate' );
            if ( $cached_rate !== false ) {
                return (float) $cached_rate;
            }

            // Fetch from free API (no key required for this specific endpoint)
            $response = wp_remote_get( 'https://open.er-api.com/v6/latest/USD' );
            if ( ! is_wp_error( $response ) ) {
                $data = json_decode( wp_remote_retrieve_body( $response ), true );
                if ( isset( $data['rates']['IDR'] ) ) {
                    $rate = (float) $data['rates']['IDR'];
                    set_transient( 'lcp_realtime_rate', $rate, 12 * HOUR_IN_SECONDS );
                    return $rate;
                }
            }
        }

        // Fallback to manual rate
        return (float) get_option( 'lcp_exchange_rate', 15000 );
    }

    public function detect_user_country() {
        if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return;

        if ( isset( $_GET['lcp_debug_country'] ) ) {
            $this->user_country = sanitize_text_field( $_GET['lcp_debug_country'] );
            return;
        }

        if ( isset( $_COOKIE['lcp_user_country'] ) ) {
            $this->user_country = sanitize_text_field( $_COOKIE['lcp_user_country'] );
            return;
        }

        $ip = $this->get_user_ip();
        $response = wp_remote_get( "https://ipapi.co/{$ip}/json/" );

        if ( ! is_wp_error( $response ) ) {
            $data = json_decode( wp_remote_retrieve_body( $response ), true );
            if ( isset( $data['country_code'] ) ) {
                $this->user_country = $data['country_code'];
                setcookie( 'lcp_user_country', $this->user_country, time() + 86400, "/" );
            }
        }

        if ( empty( $this->user_country ) ) $this->user_country = 'US';
    }

    private function get_user_ip() {
        if ( ! empty( $_SERVER['HTTP_CLIENT_IP'] ) ) return $_SERVER['HTTP_CLIENT_IP'];
        if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            $ips = explode( ',', $_SERVER['HTTP_X_FORWARDED_FOR'] );
            return trim( $ips[0] );
        }
        return $_SERVER['REMOTE_ADDR'];
    }

    public function set_currency( $currency ) {
        return ( $this->user_country === 'ID' ) ? 'IDR' : 'USD';
    }

    public function set_currency_symbol( $symbol, $currency ) {
        return ( $currency === 'IDR' ) ? 'Rp. ' : $symbol;
    }

    public function convert_price( $price, $product = null ) {
        if ( empty( $price ) || ! is_numeric( $price ) ) return $price;
        return ( $this->user_country === 'ID' ) ? (float) $price * $this->exchange_rate : $price;
    }

    public function convert_shipping( $rates, $package ) {
        if ( $this->user_country === 'ID' ) {
            foreach ( $rates as $rate_key => $rate ) {
                $rates[$rate_key]->cost *= $this->exchange_rate;
                foreach ( $rates[$rate_key]->taxes as $tax_key => $tax_cost ) {
                    $rates[$rate_key]->taxes[$tax_key] *= $this->exchange_rate;
                }
            }
        }
        return $rates;
    }

    public function add_admin_menu() {
        add_options_page( 'LCP Currency Settings', 'LCP Currency', 'manage_options', 'lcp-currency-switcher', array( $this, 'settings_page' ) );
    }

    public function register_settings() {
        register_setting( 'lcp_currency_settings', 'lcp_exchange_rate' );
        register_setting( 'lcp_currency_settings', 'lcp_rate_mode' );
    }

    public function settings_page() {
        $mode = get_option( 'lcp_rate_mode', 'manual' );
        ?>
        <div class="wrap">
            <h1>LCP Currency Switcher Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields( 'lcp_currency_settings' ); ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">Rate Calculation Mode</th>
                        <td>
                            <select name="lcp_rate_mode">
                                <option value="manual" <?php selected($mode, 'manual'); ?>>Manual (Fixed Rate)</option>
                                <option value="automatic" <?php selected($mode, 'automatic'); ?>>Real-time (Automatic Fetch)</option>
                            </select>
                            <p class="description">Choose if you want to use a fixed rate or fetch live rates from the internet.</p>
                        </td>
                    </tr>
                    <tr valign="top" id="manual_rate_row">
                        <th scope="row">Manual Exchange Rate (1 USD to IDR)</th>
                        <td><input type="number" name="lcp_exchange_rate" value="<?php echo esc_attr( get_option( 'lcp_exchange_rate', 15000 ) ); ?>" /></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <hr>
            <h2>Status & Debug</h2>
            <p>Active Exchange Rate: <strong>1 USD = <?php echo number_format($this->exchange_rate, 2); ?> IDR</strong></p>
            <p>Your Current IP: <strong><?php echo $this->get_user_ip(); ?></strong></p>
            <p>Detected Country Code: <strong><?php echo $this->user_country; ?></strong></p>
            <p>Target Currency: <strong><?php echo $this->set_currency('USD'); ?></strong></p>
        </div>
        <?php
    }
}

new LCP_Currency_Switcher();
