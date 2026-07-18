// src/dashboard/components/SponsorBanner.js
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { dashboardStyles as styles } from '../dashboard.styles';

export default function SponsorBanner({ sponsor, style, imageStyle, placeholderStyle, nameStyle }) {
  const openSponsor = () => {
    if (sponsor?.url) Linking.openURL(sponsor.url).catch(() => {});
  };
  const sponsorImage = sponsor?.logo || sponsor?.image || '';
  const hasImage = !!sponsorImage;
  const sponsorNameColor = sponsor?.nameColor
    ? (String(sponsor.nameColor).startsWith('#') ? sponsor.nameColor : `#${sponsor.nameColor}`)
    : '#FFFFFF';

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={openSponsor} style={[styles.sponsorCard, style]}>
      <View style={styles.sponsorImageWrap}>
        <Text style={styles.sponsorLabel}>Sponsored By</Text>
        {hasImage ? (
          <Image source={{ uri: sponsorImage }} resizeMode="contain" style={[styles.sponsorImage, imageStyle]} />
        ) : (
          <View style={[styles.sponsorPlaceholder, placeholderStyle]}>
            <Text style={styles.sponsorPlaceholderText}>YOUR BUSINESS{`\n`}HERE</Text>
          </View>
        )}
      </View>
      <Text style={[styles.sponsorName, { color: sponsorNameColor }, nameStyle]} numberOfLines={2}>
        {sponsor?.name || 'Available Banner'}
      </Text>
    </TouchableOpacity>
  );
}
