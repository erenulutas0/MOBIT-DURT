package com.docsbot.ops.common.logging;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class RequestLoggingFilterTest {

    private final RequestLoggingFilter filter = new RequestLoggingFilter();

    @Test
    void generatesAndEchoesARequestIdWhenNoneProvided() throws Exception {
        MockHttpServletResponse response = perform(new MockHttpServletRequest("GET", "/health"));

        assertThat(response.getHeader(RequestLoggingFilter.REQUEST_ID_HEADER)).isNotBlank();
    }

    @Test
    void reusesAWellFormedCallerRequestId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/health");
        request.addHeader(RequestLoggingFilter.REQUEST_ID_HEADER, "abc-123_XYZ.7");

        MockHttpServletResponse response = perform(request);

        assertThat(response.getHeader(RequestLoggingFilter.REQUEST_ID_HEADER)).isEqualTo("abc-123_XYZ.7");
    }

    @Test
    void replacesAMalformedCallerRequestId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/health");
        request.addHeader(RequestLoggingFilter.REQUEST_ID_HEADER, "spoofed id with spaces");

        MockHttpServletResponse response = perform(request);

        assertThat(response.getHeader(RequestLoggingFilter.REQUEST_ID_HEADER))
                .isNotBlank()
                .isNotEqualTo("spoofed id with spaces");
    }

    private MockHttpServletResponse perform(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
